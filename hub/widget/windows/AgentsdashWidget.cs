// Floating widget host for Windows: a borderless, always-on-top window around a WebView2 control showing the hub page.
// Contract (arguments, settings file, behaviour): docs/widget.md. Built by widget/build.mjs with csc.exe of .NET Framework 4,
// so this file is C# 5: no string interpolation, no null-conditional operator, no expression-bodied members.
//
// Layout note: a WebView2 control is a child window that takes every mouse message of its area, so drag and resize cannot be an
// invisible overlay on the page. The form pads the control with a thin frame (Border) and a thin top strip (Strip); both are drawn in the
// page background color and answer WM_NCHITTEST, which gives native drag, resize and snapping.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Net;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Agentsdash
{
    internal sealed class Settings
    {
        public double? X, Y;
        public int Width = 420, Height = 300, Opacity = 100;
        public string AlwaysOnTop = "on";    // "on", "off", or "auto" (on top only while a session is not done); saved as true, false, "auto"

        static double? Num(string json, string key)
        {
            Match m = Regex.Match(json, "\"" + key + "\"\\s*:\\s*(-?[0-9]+(?:\\.[0-9]+)?)");
            double v;
            return m.Success && double.TryParse(m.Groups[1].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out v) ? (double?)v : null;
        }

        // Same rules as readSettings in widget/run.mjs: a missing or invalid field keeps its default.
        public static Settings Load(string file)
        {
            Settings s = new Settings();
            string json;
            try { json = File.ReadAllText(file); } catch { return s; }
            s.X = Num(json, "x");
            s.Y = Num(json, "y");
            double w = Num(json, "width") ?? 0, h = Num(json, "height") ?? 0, o = Num(json, "opacity") ?? 0;
            if (w >= 160) s.Width = (int)w;
            if (h >= 100) s.Height = (int)h;
            if (o == 100 || o == 85 || o == 70) s.Opacity = (int)o;
            Match t = Regex.Match(json, "\"alwaysOnTop\"\\s*:\\s*(true|false|\"auto\")");
            if (t.Success) s.AlwaysOnTop = t.Groups[1].Value == "true" ? "on" : t.Groups[1].Value == "false" ? "off" : "auto";
            return s;
        }

        public void Save(string file)
        {
            Func<double?, string> n = delegate (double? v) { return v.HasValue ? Math.Round(v.Value).ToString(CultureInfo.InvariantCulture) : "null"; };
            string json = "{\"x\": " + n(X) + ", \"y\": " + n(Y) + ", \"width\": " + Width + ", \"height\": " + Height
                + ", \"opacity\": " + Opacity + ", \"alwaysOnTop\": " + (AlwaysOnTop == "on" ? "true" : AlwaysOnTop == "off" ? "false" : "\"auto\"") + "}\n";
            try { Directory.CreateDirectory(Path.GetDirectoryName(file)); File.WriteAllText(file, json); } catch { }
        }
    }

    // The top strip: transparent to the mouse, so the form below answers WM_NCHITTEST (HTCAPTION: drag), except over its four
    // buttons (pin, minimize, maximize or restore, close) at the right end, which it draws and handles itself.
    internal sealed class Strip : Panel
    {
        const int ButtonWidth = 26, ButtonCount = 4;
        public bool Maximized;
        public string PinMode = "on";         // "on", "auto" or "off"
        public Action<int> ButtonClick;       // 0 pin (cycles always on top: on, auto, off), 1 minimize, 2 maximize or restore, 3 close
        int hover = -1;

        public Strip() { DoubleBuffered = true; }

        Rectangle ButtonRect(int i) { return new Rectangle(Width - (ButtonCount - i) * ButtonWidth, 0, ButtonWidth, Height); }

        int ButtonAt(Point p)
        {
            for (int i = 0; i < ButtonCount; i++) if (ButtonRect(i).Contains(p)) return i;
            return -1;
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == 0x0084)
            {
                long lp = m.LParam.ToInt64();
                Point p = PointToClient(new Point((short)(lp & 0xFFFF), (short)((lp >> 16) & 0xFFFF)));
                m.Result = ButtonAt(p) >= 0 ? (IntPtr)1 : (IntPtr)(-1);   // HTCLIENT over a button, else HTTRANSPARENT
                return;
            }
            base.WndProc(ref m);
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            int h = ButtonAt(e.Location);
            if (h != hover) { hover = h; Invalidate(); }
            base.OnMouseMove(e);
        }
        protected override void OnMouseLeave(EventArgs e) { hover = -1; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnMouseUp(MouseEventArgs e)
        {
            int b = ButtonAt(e.Location);
            if (e.Button == MouseButtons.Left && b >= 0 && ButtonClick != null) ButtonClick(b);
            base.OnMouseUp(e);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            Graphics g = e.Graphics;
            using (Brush grip = new SolidBrush(Color.FromArgb(90, 128, 128, 128)))
                g.FillRectangle(grip, Width / 2 - 14, Height / 2 - 1, 28, 3);
            using (Pen pen = new Pen(Color.FromArgb(190, 190, 198), 1.4f))
            {
                for (int i = 0; i < ButtonCount; i++)
                {
                    Rectangle r = ButtonRect(i);
                    if (hover == i)
                        using (Brush hb = new SolidBrush(i == 3 ? Color.FromArgb(200, 64, 64) : Color.FromArgb(70, 128, 128, 140)))
                            g.FillRectangle(hb, r);
                    int cx = r.X + r.Width / 2, cy = r.Y + r.Height / 2;
                    if (i == 0)
                    {   // drawing pin (thumbtack): white and filled when always on top, white with a filled head only in auto mode, a gray outline when off
                        Color ink = PinMode == "off" ? Color.FromArgb(150, 150, 160) : Color.FromArgb(240, 240, 244);
                        using (Pen pin = new Pen(ink, 1.2f))
                        using (Brush fill = new SolidBrush(PinMode == "off" ? Color.Transparent : ink))
                        using (Brush bodyFill = new SolidBrush(PinMode == "on" ? ink : Color.Transparent))
                        {
                            Point[] body = { new Point(cx - 3, cy - 4), new Point(cx + 3, cy - 4), new Point(cx + 2, cy + 1), new Point(cx - 2, cy + 1) };
                            g.FillRectangle(fill, cx - 4, cy - 7, 8, 3);                  // flat head
                            g.DrawRectangle(pin, cx - 4, cy - 7, 8, 3);
                            g.FillPolygon(bodyFill, body);                                // tapered body
                            g.DrawPolygon(pin, body);
                            g.DrawLine(pin, cx - 4, cy + 1, cx + 4, cy + 1);              // base
                            g.DrawLine(pin, cx, cy + 1, cx, cy + 6);                      // needle
                        }
                    }
                    else if (i == 1) g.DrawLine(pen, cx - 4, cy + 2, cx + 4, cy + 2);
                    else if (i == 2 && !Maximized) g.DrawRectangle(pen, cx - 4, cy - 4, 8, 8);
                    else if (i == 2) { g.DrawRectangle(pen, cx - 4, cy - 2, 6, 6); g.DrawLines(pen, new Point[] { new Point(cx - 2, cy - 2), new Point(cx - 2, cy - 5), new Point(cx + 4, cy - 5), new Point(cx + 4, cy + 1), new Point(cx + 2, cy + 1) }); }
                    else { g.DrawLine(pen, cx - 4, cy - 4, cx + 4, cy + 4); g.DrawLine(pen, cx - 4, cy + 4, cx + 4, cy - 4); }
                }
            }
        }
    }

    internal sealed class WidgetForm : Form
    {
        const int Border = 5, StripHeight = 18, RetryMs = 3000;
        const int WM_NCHITTEST = 0x0084, WM_SETCURSOR = 0x0020, WM_NCLBUTTONDBLCLK = 0x00A3, WM_NCRIGHTBUTTONUP = 0x00A5;
        const int HTCLIENT = 1, HTCAPTION = 2, HTLEFT = 10, HTRIGHT = 11, HTTOP = 12, HTTOPLEFT = 13, HTTOPRIGHT = 14, HTBOTTOM = 15, HTBOTTOMLEFT = 16, HTBOTTOMRIGHT = 17;

        readonly string url, settingsFile;
        readonly Settings settings;
        readonly WebView2 web = new WebView2();
        readonly Strip strip = new Strip();
        readonly ContextMenuStrip menu = new ContextMenuStrip();
        readonly Dictionary<string, ToolStripMenuItem> topItems = new Dictionary<string, ToolStripMenuItem>();
        readonly System.Windows.Forms.Timer saveTimer = new System.Windows.Forms.Timer { Interval = 500 };
        readonly System.Windows.Forms.Timer retryTimer = new System.Windows.Forms.Timer { Interval = RetryMs };
        readonly System.Windows.Forms.Timer sessionTimer = new System.Windows.Forms.Timer { Interval = RetryMs };
        bool placeholder, sessionsRunning;

        public WidgetForm(string url, string settingsFile)
        {
            this.url = url;
            this.settingsFile = settingsFile;
            settings = Settings.Load(settingsFile);

            Text = "agentsdash";
            FormBorderStyle = FormBorderStyle.None;
            BackColor = Color.FromArgb(24, 24, 28);
            Padding = new Padding(Border);
            MinimumSize = new Size(160, 100);
            TopMost = settings.AlwaysOnTop == "on";
            Opacity = settings.Opacity / 100.0;
            StartPosition = FormStartPosition.Manual;
            Bounds = StartBounds();

            strip.Dock = DockStyle.Top;
            strip.Height = StripHeight;
            strip.BackColor = BackColor;
            strip.ButtonClick = delegate (int b)
            {
                if (b == 0) SetTopMode(settings.AlwaysOnTop == "on" ? "auto" : settings.AlwaysOnTop == "auto" ? "off" : "on");   // pin button cycles on, auto, off
                else if (b == 1) PostMessage(Handle, 0x0112, (IntPtr)0xF020, IntPtr.Zero);   // WM_SYSCOMMAND SC_MINIMIZE, as the OS does: setting WindowState from a mouse handler left a blank window after the restore
                else if (b == 2) ToggleMaximize();
                else Close();
            };
            strip.PinMode = settings.AlwaysOnTop;
            web.Dock = DockStyle.Fill;
            web.CreationProperties = new CoreWebView2CreationProperties
            {
                UserDataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "agentsdash-widget")
            };
            web.NavigationCompleted += OnNavigationCompleted;
            // Docked in reverse order: the control fills what the strip leaves.
            Controls.Add(web);
            Controls.Add(strip);

            BuildMenu();
            saveTimer.Tick += delegate { saveTimer.Stop(); SaveNow(); };
            retryTimer.Tick += delegate { Probe(); };
            sessionTimer.Tick += delegate { PollSessions(); };
            sessionTimer.Start();
            Move += delegate { ScheduleSave(); };
            Resize += delegate
            {
                strip.Maximized = WindowState == FormWindowState.Maximized;
                if (WindowState != FormWindowState.Minimized) { PerformLayout(); Invalidate(true); }   // repaint the children after a restore
                ScheduleSave();
            };
            FormClosing += delegate { SaveNow(); };
            Shown += async delegate { await InitWebView(); };
        }

        // The saved rectangle when it touches a connected screen, else the top-right corner of the primary screen.
        Rectangle StartBounds()
        {
            Rectangle want = new Rectangle((int)(settings.X ?? 0), (int)(settings.Y ?? 0), settings.Width, settings.Height);
            if (settings.X.HasValue && settings.Y.HasValue)
                foreach (Screen sc in Screen.AllScreens)
                    if (sc.WorkingArea.IntersectsWith(want)) return want;
            Rectangle wa = Screen.PrimaryScreen.WorkingArea;
            return new Rectangle(Math.Max(wa.Left, wa.Right - settings.Width - 20), wa.Top + 20, settings.Width, settings.Height);
        }

        void BuildMenu()
        {
            string[][] modes = { new[] { "on", "Always on top" }, new[] { "auto", "On top while sessions run" }, new[] { "off", "Not on top" } };
            foreach (string[] mode in modes)
            {
                string key = mode[0];
                ToolStripMenuItem item = new ToolStripMenuItem(mode[1]) { Checked = settings.AlwaysOnTop == key };
                item.Click += delegate { SetTopMode(key); };
                topItems[key] = item;
                menu.Items.Add(item);
            }
            List<ToolStripMenuItem> levels = new List<ToolStripMenuItem>();
            foreach (int pct in new int[] { 100, 85, 70 })
            {
                int value = pct;
                ToolStripMenuItem item = new ToolStripMenuItem("Opacity " + value + " %") { Checked = settings.Opacity == value };
                item.Click += delegate
                {
                    settings.Opacity = value;
                    Opacity = value / 100.0;
                    foreach (ToolStripMenuItem other in levels) other.Checked = other == item;
                    SaveNow();
                };
                levels.Add(item);
                menu.Items.Add(item);
            }
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Reload", null, delegate { if (web.CoreWebView2 != null) web.CoreWebView2.Navigate(url); });
            menu.Items.Add("Close", null, delegate { Close(); });
        }

        async Task InitWebView()
        {
            try
            {
                // The widget only talks to the local hub: no proxy lookup (system proxy detection can take many seconds behind a VPN).
                CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, web.CreationProperties.UserDataFolder,
                    new CoreWebView2EnvironmentOptions("--no-proxy-server"));
                await web.EnsureCoreWebView2Async(env);
            }
            catch (WebView2RuntimeNotFoundException)
            {
                MessageBox.Show("The WebView2 runtime is not installed. Install the Evergreen runtime from Microsoft, then start the widget again.", "agentsdash widget");
                Environment.ExitCode = 3;
                Close();
                return;
            }
            catch (Exception e)
            {
                MessageBox.Show("The widget could not start its web view: " + e.Message, "agentsdash widget");
                Environment.ExitCode = 1;
                Close();
                return;
            }
            web.CoreWebView2.Settings.AreDevToolsEnabled = false;
            web.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            web.CoreWebView2.Settings.IsStatusBarEnabled = false;
            web.CoreWebView2.Navigate(url);
        }

        async void OnNavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            if (placeholder) return;   // the "Hub not running" page itself finished loading
            if (!e.IsSuccess)
            {
                placeholder = true;
                web.CoreWebView2.NavigateToString("<html><body style=\"margin:0;background:#18181c;color:#aaa;font:14px Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh\">Hub not running</body></html>");
                retryTimer.Start();
                return;
            }
            retryTimer.Stop();
            try
            {
                string css = await web.CoreWebView2.ExecuteScriptAsync("getComputedStyle(document.body).backgroundColor");
                Match m = Regex.Match(css, "rgb\\((\\d+), (\\d+), (\\d+)\\)");
                if (m.Success)
                    BackColor = strip.BackColor = Color.FromArgb(int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value), int.Parse(m.Groups[3].Value));
            }
            catch { }
        }

        // The hub answers /health when it runs; a probe off the UI thread avoids reloading a failing page every 3 s.
        void Probe()
        {
            retryTimer.Stop();
            Task.Run(delegate
            {
                bool up = false;
                try
                {
                    HttpWebRequest req = (HttpWebRequest)WebRequest.Create(new Uri(new Uri(url), "health"));
                    req.Timeout = 1500;
                    using (req.GetResponse()) { up = true; }
                }
                catch { }
                BeginInvoke(new Action(delegate
                {
                    if (up) { placeholder = false; web.CoreWebView2.Navigate(url); }
                    else retryTimer.Start();
                }));
            });
        }

        void SetTopMode(string mode)
        {
            settings.AlwaysOnTop = mode;
            foreach (KeyValuePair<string, ToolStripMenuItem> kv in topItems) kv.Value.Checked = kv.Key == mode;
            strip.PinMode = mode;
            strip.Invalidate();
            ApplyTop();
            SaveNow();
            if (mode == "auto") PollSessions();
        }

        // On top when the mode is "on", or "auto" and at least one session of the hub is not done.
        void ApplyTop() { TopMost = settings.AlwaysOnTop == "on" || (settings.AlwaysOnTop == "auto" && sessionsRunning); }

        // In auto mode the hub state says whether a session is not done (its "dot" is anything but done); read off the UI thread.
        void PollSessions()
        {
            if (settings.AlwaysOnTop != "auto") return;
            Task.Run(delegate
            {
                bool running = false;
                try
                {
                    HttpWebRequest req = (HttpWebRequest)WebRequest.Create(new Uri(new Uri(url), "state"));
                    req.Timeout = 1500;
                    using (WebResponse resp = req.GetResponse())
                    using (StreamReader rd = new StreamReader(resp.GetResponseStream()))
                        foreach (Match m in Regex.Matches(rd.ReadToEnd(), "\"dot\"\\s*:\\s*\"(\\w+)\""))
                            if (m.Groups[1].Value != "done") running = true;
                }
                catch { }
                BeginInvoke(new Action(delegate { sessionsRunning = running; ApplyTop(); }));
            });
        }

        [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, int msg, IntPtr w, IntPtr l);

        // A borderless form maximizes over the taskbar unless MaximizedBounds is the working area of its screen.
        void ToggleMaximize()
        {
            if (WindowState == FormWindowState.Maximized) { WindowState = FormWindowState.Normal; return; }
            MaximizedBounds = Screen.FromControl(this).WorkingArea;
            WindowState = FormWindowState.Maximized;
        }

        void ScheduleSave() { saveTimer.Stop(); saveTimer.Start(); }

        void SaveNow()
        {
            if (WindowState == FormWindowState.Normal) { settings.X = Left; settings.Y = Top; settings.Width = Width; settings.Height = Height; }
            settings.Save(settingsFile);
        }

        protected override void WndProc(ref Message m)
        {
            switch (m.Msg)
            {
                case WM_NCHITTEST:
                {
                    long lp = m.LParam.ToInt64();
                    Point p = PointToClient(new Point((short)(lp & 0xFFFF), (short)((lp >> 16) & 0xFFFF)));
                    bool max = WindowState == FormWindowState.Maximized;   // no resize border while maximized
                    bool l = !max && p.X < Border, r = !max && p.X >= ClientSize.Width - Border, t = !max && p.Y < Border, b = !max && p.Y >= ClientSize.Height - Border;
                    int hit = t && l ? HTTOPLEFT : t && r ? HTTOPRIGHT : b && l ? HTBOTTOMLEFT : b && r ? HTBOTTOMRIGHT
                        : t ? HTTOP : b ? HTBOTTOM : l ? HTLEFT : r ? HTRIGHT : p.Y < Border + StripHeight ? HTCAPTION : HTCLIENT;
                    m.Result = (IntPtr)hit;
                    return;
                }
                case WM_SETCURSOR:
                    if ((int)(m.LParam.ToInt64() & 0xFFFF) == HTCAPTION) { Cursor.Current = Cursors.SizeAll; m.Result = (IntPtr)1; return; }   // the strip drags the window
                    break;
                case WM_NCLBUTTONDBLCLK:
                    return;   // a double click on the strip must not maximize
                case WM_NCRIGHTBUTTONUP:
                    menu.Show(Cursor.Position);
                    return;
            }
            base.WndProc(ref m);
        }
    }

    internal static class Program
    {
        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string cls, string title);
        [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
        [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, int msg, IntPtr w, IntPtr l);
        [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);

        [STAThread]
        static int Main(string[] args)
        {
            string url = "http://127.0.0.1:8765/", settingsFile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".agentsdash", "widget.json");
            for (int i = 0; i + 1 < args.Length; i += 2)
            {
                if (args[i] == "--url") url = args[i + 1];
                else if (args[i] == "--settings") settingsFile = args[i + 1];
            }

            bool first;
            using (Mutex single = new Mutex(true, "Local\\agentsdash-widget", out first))
            {
                if (!first)
                {
                    IntPtr h = FindWindow(null, "agentsdash");
                    // SC_RESTORE (0xF120) like a taskbar click: ShowWindow(SW_RESTORE) on a window minimized by its own button left it blank.
                    if (h != IntPtr.Zero) { if (IsIconic(h)) SendMessage(h, 0x0112, (IntPtr)0xF120, IntPtr.Zero); SetForegroundWindow(h); }
                    return 0;
                }
                SetProcessDPIAware();
                Application.EnableVisualStyles();
                Application.Run(new WidgetForm(url, settingsFile));
                return Environment.ExitCode;
            }
        }
    }
}
