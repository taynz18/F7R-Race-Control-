"""F7R Windows receiver. Credentials travel only over the child process stdin pipe."""
import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import sys
import threading
import tkinter as tk
from tkinter import ttk
import webbrowser

DASHBOARD = "https://taynz18.github.io/F7R-Race-Control-/?v=0.7.0"
BG, CARD, TEXT, MUTED, RED = "#0b0d12", "#161b26", "#f2f4f8", "#a1adbf", "#ed2944"

def resources():
    return Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))

def node_path():
    bundled = resources() / "runtime" / "node.exe"
    return str(bundled) if bundled.exists() else shutil.which("node")

class ReceiverApp:
    def __init__(self, root):
        self.root, self.process = root, None
        self.events, self.generation, self.races = queue.Queue(), 0, []
        self.closed = False
        root.title("F7R Receiver")
        root.geometry("650x740")
        root.minsize(580, 680)
        root.configure(bg=BG)
        try: root.iconbitmap(str(resources() / "assets" / "f7r-app.ico"))
        except tk.TclError: pass
        style = ttk.Style(root)
        style.theme_use("clam")
        style.configure("TCombobox", fieldbackground=CARD, background=CARD, foreground=TEXT)
        outer = tk.Frame(root, bg=BG, padx=30, pady=24)
        outer.pack(fill="both", expand=True)
        tk.Label(outer, text="F7R", font=("Segoe UI", 30, "bold"), bg=BG, fg=TEXT).pack(anchor="w")
        tk.Label(outer, text="LIVE TELEMETRY RECEIVER", font=("Segoe UI", 10, "bold"), bg=BG, fg=RED).pack(anchor="w", pady=(0, 18))
        self.status = tk.StringVar(value="Sign in to connect your race.")
        tk.Label(outer, textvariable=self.status, bg=CARD, fg=TEXT, wraplength=535,
                 justify="left", padx=15, pady=14, font=("Segoe UI", 11)).pack(fill="x", pady=(0, 18))
        self.email = self.field(outer, "Receiver email", "formula7racing@gmail.com")
        self.password = self.field(outer, "F7R password", "", secret=True)
        self.password.bind("<Return>", lambda _: self.sign_in())
        self.login = self.button(outer, "Sign in", self.sign_in, RED)
        self.login.pack(fill="x", pady=(5, 16))
        tk.Label(outer, text="Assigned live race", bg=BG, fg=MUTED, font=("Segoe UI", 10)).pack(anchor="w")
        self.race = ttk.Combobox(outer, state="disabled")
        self.race.pack(fill="x", pady=(6, 12))
        self.ip = self.field(outer, "Game IP (optional — leave blank for automatic detection)", "")
        self.connect = self.button(outer, "Connect receiver", self.start_receiver, "#25374a")
        self.connect.configure(state="disabled")
        self.connect.pack(fill="x", pady=(4, 10))
        self.disconnect = self.button(outer, "Disconnect / sign out", self.stop, "#252b38")
        self.disconnect.configure(state="disabled")
        self.disconnect.pack(fill="x")
        self.button(outer, "Open F7R dashboard", lambda: webbrowser.open(DASHBOARD), "#252b38").pack(fill="x", pady=(10, 14))
        tk.Label(outer, text="Same Wi-Fi as F1 • UDP 20777 • Broadcast On • Format 2026\n"
                 "Close Racing League Tools before connecting.\n"
                 "Use Start / Stop live telemetry in the admin dashboard.\n"
                 "Keep this app open while racing. Passwords are never saved.",
                 bg=BG, fg=MUTED, justify="left", wraplength=535, font=("Segoe UI", 9)).pack(anchor="w")
        root.protocol("WM_DELETE_WINDOW", self.close)
        root.after(100, self.poll)

    def field(self, parent, label, default, secret=False):
        tk.Label(parent, text=label, bg=BG, fg=MUTED, font=("Segoe UI", 10)).pack(anchor="w")
        entry = tk.Entry(parent, bg=CARD, fg=TEXT, insertbackground=TEXT, relief="flat",
                         font=("Segoe UI", 11), show="•" if secret else "")
        entry.insert(0, default)
        entry.pack(fill="x", ipady=9, pady=(6, 12))
        return entry

    def button(self, parent, label, command, color):
        return tk.Button(parent, text=label, command=command, bg=color, fg=TEXT,
                         activebackground=RED, activeforeground=TEXT, relief="flat",
                         padx=12, pady=10, font=("Segoe UI", 10, "bold"), cursor="hand2")

    def sign_in(self):
        email, password = self.email.get().strip(), self.password.get()
        if not email or not password:
            self.status.set("Enter your F7R email and password.")
            return
        self.stop()
        runtime = node_path()
        if not runtime:
            self.status.set("Bundled runtime missing. Extract the complete F7R Receiver ZIP again.")
            return
        self.status.set("Signing in securely…")
        self.login.configure(state="disabled")
        self.password.delete(0, "end")
        generation = self.generation
        try:
            child_env = os.environ.copy()
            child_env.pop("F7R_RECEIVER_PASSWORD", None)
            self.process = subprocess.Popen(
                [runtime, str(resources() / "receiver" / "desktop-worker.mjs")],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding="utf-8", errors="replace",
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0), env=child_env)
            self.process.stdin.write(json.dumps({"email": email, "password": password}) + "\n")
            self.process.stdin.flush()
            password = ""
            self.disconnect.configure(state="normal")
            threading.Thread(target=self.read_events, args=(self.process, generation), daemon=True).start()
        except (OSError, ValueError):
            self.stop()
            self.status.set("Could not start the receiver. Extract the complete ZIP and try again.")

    def read_events(self, process, generation):
        for line in process.stdout:
            try: event = json.loads(line)
            except (ValueError, TypeError): continue
            self.events.put((generation, event))
        process.wait()
        self.events.put((generation, {"type": "exit", "code": process.returncode}))

    def start_receiver(self):
        index = self.race.current()
        if not self.process or index < 0 or index >= len(self.races): return
        try:
            self.process.stdin.write(json.dumps({"sessionId": self.races[index]["id"], "gameIp": self.ip.get().strip()}) + "\n")
            self.process.stdin.flush()
            self.connect.configure(state="disabled")
            self.race.configure(state="disabled")
            self.status.set("Connecting receiver and detecting game…")
        except (OSError, ValueError):
            self.stop()
            self.status.set("Receiver connection closed. Sign in again.")

    def handle(self, event):
        kind, message = event.get("type"), event.get("message", "")
        if kind == "races":
            self.races = event["races"]
            self.race.configure(values=[r["title"] + " · " + str(r["game_format"]) for r in self.races], state="readonly")
            self.race.current(0)
            self.connect.configure(state="normal")
            self.status.set("Signed in. Choose your race and connect; game detection is automatic.")
        elif kind == "connected":
            self.status.set("Receiver connected. Searching for the game on your network…")
        elif kind == "fatal":
            self.stop()
            self.status.set(message)
        elif kind == "error":
            self.status.set(message or "Receiver error. Check your connection.")
        elif kind == "log":
            if message.startswith("Publishing frame"):
                self.status.set("LIVE · " + message.split("·")[-1].strip() + "\nPublishing to the F7R dashboard.")
            elif message.startswith("Game feed found"):
                self.status.set(message + "\nUse Start live telemetry in the admin dashboard.")
            elif message.startswith("Receiver state:"):
                state = message.split(":", 1)[1].strip()
                self.status.set({"paused": "Receiver connected · telemetry paused.\nClick Start live telemetry in the admin dashboard.",
                                 "waiting": "Receiver connected · waiting for the game.\nCheck F1 Broadcast On, port 20777 and format 2026.",
                                 "stale": "Game feed interrupted. Last readings may be outdated.",
                                 "publishing": "LIVE · publishing race data."}.get(state, state))
        elif kind == "exit":
            self.stop()
            self.status.set("Receiver stopped. Sign in again to reconnect.")

    def poll(self):
        try:
            while True:
                generation, event = self.events.get_nowait()
                if generation == self.generation: self.handle(event)
        except queue.Empty: pass
        if not self.closed: self.root.after(100, self.poll)

    def stop(self):
        self.generation += 1
        process, self.process = self.process, None
        if process:
            try: process.terminate()
            except OSError: pass
            def reap():
                try: process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    try: process.kill(); process.wait()
                    except OSError: pass
            threading.Thread(target=reap, daemon=True).start()
        self.races = []
        self.password.delete(0, "end")
        self.race.configure(state="disabled", values=[])
        self.race.set("")
        self.connect.configure(state="disabled")
        self.disconnect.configure(state="disabled")
        self.login.configure(state="normal")
        self.status.set("Disconnected. Sign in to connect your race.")

    def close(self):
        self.closed = True
        self.stop()
        self.root.destroy()

def self_test():
    assert (resources() / "receiver" / "desktop-worker.mjs").is_file()
    assert (resources() / "receiver" / "decoder.mjs").is_file()
    assert (resources() / "config.json").is_file()
    assert node_path(), "Bundled Node runtime missing"
    result = subprocess.run([node_path(), "--check", str(resources() / "receiver" / "desktop-worker.mjs")],
                            capture_output=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    assert result.returncode == 0
    root = tk.Tk()
    root.withdraw()
    app = ReceiverApp(root)
    app.handle({"type": "races", "races": [{"id": "test", "title": "F7R test", "game_format": 2026}]})
    assert app.race.current() == 0
    app.handle({"type": "log", "message": "Receiver state: paused"})
    assert "paused" in app.status.get()
    app.close()

if __name__ == "__main__":
    if "--self-test" in sys.argv: self_test()
    else: ReceiverApp(tk.Tk()).root.mainloop()
