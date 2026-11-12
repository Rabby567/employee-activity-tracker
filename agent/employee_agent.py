#!/usr/bin/env python3
"""ActivityTrack visible employee monitoring agent.

Runs in the signed-in Windows desktop session. The organization must disclose
what activity data and screenshots are collected, why, who can view them, and
how long they are retained before enabling monitoring.
"""
import io
import json
import os
import threading
import time
from datetime import datetime

import requests
import win32gui
from pynput import mouse, keyboard
from PIL import Image, ImageGrab
import pystray

APP_NAME = "ActivityTrack Agent"
AGENT_VERSION = "1.1.0"


class EmployeeAgent:
    def __init__(self):
        self.base_dir = os.path.dirname(os.path.abspath(__file__))
        self.config = self.load_config()
        self.api_key = self.config["api_key"]
        self.publishable_key = self.config.get("publishable_key", "")
        self.api_url = self.config["api_url"].rstrip("/")
        self.activity_interval = max(15, int(self.config.get("activity_interval", 30)))
        self.idle_threshold = max(60, int(self.config.get("idle_threshold", 300)))
        self.screenshot_quality = min(90, max(35, int(self.config.get("screenshot_quality", 60))))
        self.screenshot_interval = 300
        self.screenshot_enabled = False
        self.capture_requested_at = None
        self.last_capture_request = None
        self.last_screenshot_at = time.monotonic()
        self.last_activity_at = time.monotonic()
        self.running = threading.Event()
        self.running.set()
        self.session = requests.Session()
        self.session.headers.update({
            "x-api-key": self.api_key,
            "apikey": self.publishable_key,
            "User-Agent": f"ActivityTrackAgent/{AGENT_VERSION}",
        })
        self.icon = None

    def load_config(self):
        path = os.path.join(self.base_dir, "config.json")
        with open(path, "r", encoding="utf-8") as handle:
            cfg = json.load(handle)
        if not cfg.get("api_key") or cfg["api_key"] == "YOUR_EMPLOYEE_API_KEY_HERE":
            raise RuntimeError("Employee API key is missing from config.json")
        if not cfg.get("api_url"):
            raise RuntimeError("Supabase Functions URL is missing from config.json")
        if not cfg.get("publishable_key") or cfg["publishable_key"] == "YOUR_SUPABASE_PUBLISHABLE_KEY":
            raise RuntimeError("Supabase publishable key is missing from config.json")
        return cfg

    def on_input(self, *_args):
        self.last_activity_at = time.monotonic()

    def active_window(self):
        try:
            hwnd = win32gui.GetForegroundWindow()
            return win32gui.GetWindowText(hwnd) or "Unknown"
        except Exception:
            return "Unknown"

    def post_activity(self):
        window = self.active_window()
        idle = (time.monotonic() - self.last_activity_at) >= self.idle_threshold
        payload = {
            "app_name": window,
            "window_title": window,
            "status": "idle" if idle else "working",
            "duration_seconds": self.activity_interval,
        }
        try:
            response = self.session.post(f"{self.api_url}/log-activity", json=payload, timeout=15)
            response.raise_for_status()
        except requests.RequestException as exc:
            self.write_log(f"Activity heartbeat failed: {exc}")

    def fetch_remote_config(self):
        try:
            response = self.session.get(f"{self.api_url}/agent-config", timeout=15)
            response.raise_for_status()
            data = response.json()
            was_enabled = self.screenshot_enabled
            self.screenshot_enabled = bool(data.get("screenshot_enabled", False))
            if self.screenshot_enabled and not was_enabled:
                # Start the 5-minute schedule from the moment admin enables capture.
                self.last_screenshot_at = time.monotonic()
            self.screenshot_interval = min(3600, max(60, int(data.get("screenshot_interval", 300))))
            self.capture_requested_at = data.get("capture_requested_at")
            if self.icon:
                state = "enabled" if self.screenshot_enabled else "disabled"
                self.icon.title = f"ActivityTrack — Monitoring Active; screenshots {state}"
        except (requests.RequestException, ValueError, TypeError) as exc:
            self.write_log(f"Remote settings sync failed: {exc}")

    def upload_screenshot(self, reason="scheduled"):
        if not self.screenshot_enabled:
            return False
        try:
            image = ImageGrab.grab(all_screens=True)
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=self.screenshot_quality, optimize=True)
            buffer.seek(0)
            data = {"capture_reason": reason}
            if reason == "admin_requested" and self.capture_requested_at:
                data["capture_requested_at"] = self.capture_requested_at
            response = self.session.post(
                f"{self.api_url}/upload-screenshot",
                files={"screenshot": ("activitytrack.jpg", buffer, "image/jpeg")},
                data=data,
                timeout=45,
            )
            response.raise_for_status()
            self.last_screenshot_at = time.monotonic()
            self.write_log(f"Screenshot uploaded ({reason})")
            return True
        except Exception as exc:
            self.write_log(f"Screenshot upload failed: {exc}")
            return False

    def config_loop(self):
        while self.running.is_set():
            try:
                self.fetch_remote_config()
                if (self.screenshot_enabled and self.capture_requested_at
                        and self.capture_requested_at != self.last_capture_request):
                    if self.upload_screenshot("admin_requested"):
                        self.last_capture_request = self.capture_requested_at
                elif (self.screenshot_enabled and
                      time.monotonic() - self.last_screenshot_at >= self.screenshot_interval):
                    self.upload_screenshot("scheduled")
            except Exception as exc:
                self.write_log(f"Remote control loop error: {exc}")
            self.running.wait(30)

    def activity_loop(self):
        while self.running.is_set():
            try:
                self.post_activity()
            except Exception as exc:
                self.write_log(f"Activity loop error: {exc}")
            self.running.wait(self.activity_interval)

    def write_log(self, message):
        log_path = os.path.join(self.base_dir, "agent.log")
        try:
            with open(log_path, "a", encoding="utf-8") as handle:
                handle.write(f"{datetime.now().isoformat(timespec='seconds')} {message}\n")
        except OSError:
            pass

    def create_tray_icon(self):
        icon_image = Image.new("RGB", (64, 64), color="#16a34a")
        menu = pystray.Menu(
            pystray.MenuItem("ActivityTrack monitoring is active", lambda: None, enabled=False),
            pystray.MenuItem("Screenshot setting is controlled by your administrator", lambda: None, enabled=False),
            pystray.MenuItem("Open agent log", self.open_log),
        )
        self.icon = pystray.Icon(APP_NAME, icon_image, "ActivityTrack — Monitoring Active", menu)
        return self.icon

    def open_log(self, _icon=None, _item=None):
        path = os.path.join(self.base_dir, "agent.log")
        if os.path.exists(path):
            os.startfile(path)

    def start(self):
        self.write_log("Agent started in visible user session")
        mouse_listener = mouse.Listener(on_move=self.on_input, on_click=self.on_input, on_scroll=self.on_input)
        keyboard_listener = keyboard.Listener(on_press=self.on_input)
        mouse_listener.start()
        keyboard_listener.start()
        threading.Thread(target=self.activity_loop, name="activity-heartbeat", daemon=True).start()
        threading.Thread(target=self.config_loop, name="remote-settings", daemon=True).start()
        try:
            self.create_tray_icon().run()
        finally:
            self.running.clear()
            mouse_listener.stop()
            keyboard_listener.stop()
            self.session.close()
            self.write_log("Agent stopped")


if __name__ == "__main__":
    try:
        EmployeeAgent().start()
    except Exception as error:
        log_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agent.log")
        with open(log_file, "a", encoding="utf-8") as handle:
            handle.write(f"{datetime.now().isoformat(timespec='seconds')} FATAL: {error}\n")
        raise
