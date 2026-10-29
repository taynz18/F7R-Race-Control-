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
BG, CARD, TEXT, MUTED, RED = "#0b0e16", "#141b29", "#f2f5fc", "#99a8c0", "#ef3153"

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
        self.last_error = ""
        root.title("F7R Receiver · 0.1.12")
        root.geometry(f"{min(980, root.winfo_screenwidth()-80)}x{min(820, root.winfo_screenheight()-100)}")
        root.minsize(720, 620)
        root.configure(bg=BG)
        try: root.iconbitmap(str(resources() / "assets" / "f7r-app.ico"))
        except tk.TclError: pass
        style = ttk.Style(root)
        style.theme_use("clam")
        style.configure("TCombobox", fieldbackground="#101725", background="#202c40", foreground=TEXT,
                        arrowcolor="#d4def0", bordercolor="#2c3a52", lightcolor="#2c3a52", darkcolor="#2c3a52", padding=10, font=("Segoe UI", 10))
        style.map("TCombobox", fieldbackground=[("readonly", "#101725"), ("disabled", "#111725")],
                  foreground=[("disabled", "#66758d"), ("readonly", TEXT)], selectbackground=[("readonly", "#25344d")])
        style.configure("Vertical.TScrollbar", background="#29354a", troughcolor=BG, borderwidth=0, arrowsize=10)
        root.option_add("*TCombobox*Listbox.background", "#172133")
        root.option_add("*TCombobox*Listbox.foreground", TEXT)
        root.option_add("*TCombobox*Listbox.selectBackground", "#394b69")
        root.option_add("*TCombobox*Listbox.font", ("Segoe UI", 11))
        viewport = tk.Frame(root, bg=BG)
        viewport.pack(fill="both", expand=True)
        canvas = tk.Canvas(viewport, bg=BG, highlightthickness=0)
        scrollbar = ttk.Scrollbar(viewport, orient="vertical", command=canvas.yview)
        canvas.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side="right", fill="y")
        canvas.pack(side="left", fill="both", expand=True)
        outer = tk.Frame(canvas, bg=BG, padx=28, pady=24)
        content = canvas.create_window((0, 0), window=outer, anchor="nw")
        outer.bind("<Configure>", lambda _: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.bind("<Configure>", lambda event: canvas.itemconfigure(content, width=event.width))
        root.bind("<MouseWheel>", lambda event: canvas.yview_scroll(int(-event.delta/120), "units"))
        header = tk.Frame(outer, bg=BG)
        header.pack(fill="x", pady=(0, 20))
        try:
            self.logo = tk.PhotoImage(file=str(resources() / "assets" / "f7r-logo.png"))
            self.logo = self.logo.subsample(max(1, (self.logo.width()+219)//220))
            tk.Label(header, image=self.logo, bg=BG).pack(side="left", anchor="w")
        except tk.TclError:
            tk.Label(header, text="F7R", font=("Segoe UI", 28, "bold"), bg=BG, fg=TEXT).pack(side="left")
        title = tk.Frame(header, bg=BG)
        title.pack(side="right", anchor="e")
        tk.Label(title, text="RACE CONTROL", font=("Segoe UI", 9, "bold"), bg=BG, fg=RED).pack(anchor="e")
        tk.Label(title, text="Live telemetry receiver", font=("Segoe UI", 18, "bold"), bg=BG, fg=TEXT).pack(anchor="e")
        self.status = tk.StringVar(value="Sign in to connect your race.")
        tk.Label(outer, textvariable=self.status, bg=CARD, fg=TEXT, wraplength=535,
                 justify="left", padx=15, pady=14, font=("Segoe UI", 11)).pack(fill="x", pady=(0, 18))
        columns = tk.Frame(outer, bg=BG)
        columns.pack(fill="x")
        columns.columnconfigure(0, weight=4, uniform="panels")
        columns.columnconfigure(1, weight=5, uniform="panels")
        account = self.panel(columns, "01  /  ACCOUNT", "Your F7R connection", 0)
        connection = self.panel(columns, "02  /  TELEMETRY", "Choose your source", 1)
        self.email = self.field(account, "Receiver email", "formula7racing@gmail.com")
        self.password = self.field(account, "F7R password", "", secret=True)
        self.password.bind("<Return>", lambda _: self.sign_in())
        self.login = self.button(account, "Sign in", self.sign_in, RED)
        self.login.pack(fill="x", pady=(5, 16))
        tk.Label(account, text="Assigned live race", bg=CARD, fg=MUTED, font=("Segoe UI", 10)).pack(anchor="w")
        self.race = ttk.Combobox(account, state="disabled")
        self.race.pack(fill="x", pady=(6, 12))
        self.ip = self.field(connection, "Source device IP (optional — normally leave blank)", "")
        tk.Label(connection, text="Telemetry connection", bg=CARD, fg=MUTED, font=("Segoe UI", 10)).pack(anchor="w")
        self.mode = ttk.Combobox(connection, state="readonly", values=["F1 Broadcast", "F1 Direct IP / Port", "RLT Forwarding"])
        self.mode.current(0)
        self.mode.pack(fill="x", pady=(6, 12))
        self.mode.bind("<<ComboboxSelected>>", self.change_mode)
        self.port = self.field(connection, "F7R listening port", "20777")
        self.port.bind("<KeyRelease>", self.update_connection_hint)
        self.local_addresses = []
        self.address_hint = tk.StringVar(value="This laptop’s IP addresses appear after sign-in.")
        tk.Label(connection, textvariable=self.address_hint, bg=CARD, fg="#8bd7e0", justify="left",
                 wraplength=345, font=("Segoe UI", 9)).pack(anchor="w", pady=(0, 10))
        self.port_hint = tk.StringVar()
        tk.Label(connection, textvariable=self.port_hint, bg=CARD, fg=MUTED, justify="left",
                 wraplength=345, font=("Segoe UI", 9)).pack(anchor="w", pady=(0, 12))
        self.change_mode()
        actions = tk.Frame(outer, bg=BG)
        actions.pack(fill="x", pady=(18, 0))
        self.connect = self.button(actions, "Connect receiver", self.start_receiver, "#25374a")
        self.connect.configure(state="disabled")
        self.connect.pack(fill="x", pady=(4, 10))
        self.disconnect = self.button(actions, "Disconnect / sign out", self.stop, "#252b38")
        self.disconnect.configure(state="disabled")
        self.disconnect.pack(side="left", fill="x", expand=True, padx=(0, 6))
        self.button(actions, "Open F7R dashboard", lambda: webbrowser.open(DASHBOARD), "#252b38").pack(side="right", fill="x", expand=True, padx=(6, 0))
        footer = tk.Frame(outer, bg=BG)
        footer.pack(fill="x", pady=(18, 0))
        tk.Label(footer, text="Same network as the game • F1 UDP format 2026\n"
                 "Choose a connection mode and follow its settings above.\n"
                 "Use Start / Stop live telemetry in the admin dashboard.\n"
                 "Keep this app open while racing. Passwords are never saved.",
                 bg=BG, fg=MUTED, justify="left", wraplength=345, font=("Segoe UI", 9)).pack(anchor="w")
        root.protocol("WM_DELETE_WINDOW", self.close)
        root.after(100, self.poll)

    def panel(self, parent, eyebrow, title, column):
        panel = tk.Frame(parent, bg=CARD, highlightbackground="#263147", highlightthickness=1, padx=20, pady=20)
        panel.grid(row=0, column=column, sticky="nsew", padx=(0, 8) if column == 0 else (8, 0))
        tk.Label(panel, text=eyebrow, bg=CARD, fg="#849bbd", font=("Segoe UI", 9, "bold")).pack(anchor="w")
        tk.Label(panel, text=title, bg=CARD, fg=TEXT, font=("Segoe UI", 16, "bold")).pack(anchor="w", pady=(6, 20))
        return panel

    def field(self, parent, label, default, secret=False):
        background = parent.cget("bg")
        tk.Label(parent, text=label, bg=background, fg=MUTED, font=("Segoe UI", 10)).pack(anchor="w")
        border = tk.Frame(parent, bg="#2c3a52", padx=1, pady=1)
        border.pack(fill="x", pady=(7, 16))
        entry = tk.Entry(border, bg="#101725", fg=TEXT, insertbackground=TEXT, relief="flat",
                         disabledbackground="#101725", disabledforeground="#6d7d96", selectbackground="#394b69",
                         font=("Segoe UI", 11), show="•" if secret else "", highlightthickness=0)
        entry.insert(0, default)
        entry.pack(fill="x", padx=10, ipady=9)
        entry.bind("<FocusIn>", lambda _: border.configure(bg="#ef5270"))
        entry.bind("<FocusOut>", lambda _: border.configure(bg="#2c3a52"))
        return entry

    def button(self, parent, label, command, color):
        button = tk.Button(parent, text=label, command=command, bg=color, fg=TEXT,
                           activebackground="#f34b69", activeforeground=TEXT, relief="flat", borderwidth=0,
                           disabledforeground="#708098", highlightthickness=1, highlightbackground="#35445e",
                           padx=16, pady=11, font=("Segoe UI", 10, "bold"), cursor="hand2", takefocus=True)
        button._fade = None
        def animate(target):
            if button._fade:
                button.after_cancel(button._fade)
            if str(button.cget("state")) == "disabled":
                return
            start = button.winfo_rgb(button.cget("bg"))
            end = button.winfo_rgb(target)
            def step(frame=1):
                if not button.winfo_exists(): return
                t = 1 - (1-frame/8)**3
                rgb = [round((a+(b-a)*t)/257) for a,b in zip(start,end)]
                button.configure(bg="#%02x%02x%02x" % tuple(rgb))
                button._fade = button.after(16, lambda: step(frame+1)) if frame < 8 else None
            step()
        button.bind("<Enter>", lambda _: animate("#fc4b6b" if color == RED else "#354a67"))
        button.bind("<Leave>", lambda _: animate(color))
        button.bind("<FocusIn>", lambda _: button.configure(highlightbackground="#f17490"))
        button.bind("<FocusOut>", lambda _: button.configure(highlightbackground="#35445e"))
        return button

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

    def change_mode(self, _event=None):
        self.port.delete(0, "end")
        self.port.insert(0, "21777" if self.mode.current() == 2 else "20777")
        self.update_connection_hint()

    def update_connection_hint(self, _event=None):
        port = self.port.get().strip() or "YOUR PORT"
        mode = self.mode.current()
        if mode == 0:
            message = ("F1: UDP Telemetry On · Broadcast On · UDP Port " + port +
                       " · Format 2026.\nKeep F1 and this laptop on the same local network. Source device IP can stay blank.")
        elif mode == 1:
            target = ", ".join(self.local_addresses) or "the laptop IP shown above"
            message = ("F1: UDP Telemetry On · Broadcast Off · UDP Port " + port +
                       " · Format 2026.\nSet F1 UDP IP Address to this laptop: " + target +
                       ".\nThe game port and F7R listening port must match. Keep Source device IP blank.")
        else:
            message = ("RLT: keep its main input port at 20777. Forward to IP 127.0.0.1 and port " +
                       port + " on the same laptop.\nEnter the IP and port in separate RLT boxes. "
                       "For different PCs, forward to this laptop’s IP. Keep Source device IP blank.")
        self.port_hint.set(message)

    def start_receiver(self):
        index = self.race.current()
        if not self.process or index < 0 or index >= len(self.races): return
        port_text = self.port.get().strip()
        if not port_text.isascii() or not port_text.isdecimal() or not 1 <= int(port_text) <= 65535:
            self.status.set("Enter a listening port between 1 and 65535.")
            return
        if ":" in self.ip.get():
            self.status.set("Source IP accepts an IP address only, without :port. Usually leave it blank.")
            return
        self.last_error = ""
        try:
            self.process.stdin.write(json.dumps({"sessionId": self.races[index]["id"], "gameIp": self.ip.get().strip(), "udpPort": int(port_text)}) + "\n")
            self.process.stdin.flush()
            self.connect.configure(state="disabled")
            self.race.configure(state="disabled")
            self.mode.configure(state="disabled")
            self.port.configure(state="disabled")
            self.ip.configure(state="disabled")
            self.status.set("Connecting receiver on UDP " + port_text + " and detecting game…")
        except (OSError, ValueError):
            self.stop()
            self.status.set("Receiver connection closed. Sign in again.")

    def handle(self, event):
        kind, message = event.get("type"), event.get("message", "")
        if kind == "races":
            self.races = event["races"]
            self.local_addresses = event.get("addresses", [])
            self.address_hint.set("This laptop’s IPv4: " + (", ".join(self.local_addresses) or "No local IPv4 found"))
            self.update_connection_hint()
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
            self.last_error = message or "Receiver error. Check your connection."
            self.status.set(self.last_error)
        elif kind == "log":
            if message.startswith("New game session detected"):
                self.status.set("New game session detected · reconnecting the shared feed automatically…")
            elif message.startswith("Publishing frame"):
                self.status.set("LIVE · " + message.split("·")[-1].strip() + "\nPublishing to the F7R dashboard.")
            elif message.startswith("Game feed found"):
                self.status.set(message + "\nUse Start live telemetry in the admin dashboard.")
            elif message.startswith("Receiver state:"):
                state = message.split(":", 1)[1].strip()
                self.status.set({"paused": "Receiver connected · telemetry paused.\nClick Start live telemetry in the admin dashboard.",
                                 "waiting": "Receiver connected · waiting for telemetry on UDP " + self.port.get() + ".\nCheck the selected mode’s game settings below.",
                                 "stale": "Game feed interrupted. Last readings may be outdated.",
                                 "publishing": "LIVE · publishing race data."}.get(state, state))
        elif kind == "exit":
            error = self.last_error
            self.stop()
            self.status.set(error or "Receiver stopped. Sign in again to reconnect.")

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
        self.mode.configure(state="readonly")
        self.port.configure(state="normal")
        self.ip.configure(state="normal")
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
    app.mode.current(2)
    app.change_mode()
    assert app.port.get() == "21777"
    assert "127.0.0.1" in app.port_hint.get()
    app.mode.current(0)
    app.change_mode()
    assert app.port.get() == "20777"
    app.mode.current(1)
    app.change_mode()
    assert "Broadcast Off" in app.port_hint.get()
    app.port.delete(0, "end")
    app.port.insert(0, "20778")
    app.update_connection_hint()
    assert "20778" in app.port_hint.get()
    app.close()

if __name__ == "__main__":
    if "--self-test" in sys.argv: self_test()
    else: ReceiverApp(tk.Tk()).root.mainloop()

