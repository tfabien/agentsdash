// Floating widget host for macOS: a borderless, always-on-top window around a WKWebView showing the hub page.
// Contract (arguments, settings file, behaviour): docs/widget.md. Built by widget/build.mjs with `swiftc` (Xcode Command Line Tools).
// Unlike the Windows host, drag and resize are invisible views laid over the page (an NSView can sit above a WKWebView).
import AppKit
import WebKit

let borderWidth: CGFloat = 6
let stripHeight: CGFloat = 24
let minSize = NSSize(width: 160, height: 100)
let retrySeconds: TimeInterval = 3

// MARK: settings (same rules as readSettings in widget/run.mjs)

struct Settings {
    var x: Double? = nil, y: Double? = nil
    var width = 420.0, height = 300.0
    var opacity = 100
    var alwaysOnTop = true

    static func load(_ path: String) -> Settings {
        var s = Settings()
        guard let data = FileManager.default.contents(atPath: path),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return s }
        func num(_ key: String) -> Double? { return (obj[key] as? NSNumber).map { $0.doubleValue } }
        s.x = num("x")
        s.y = num("y")
        if let w = num("width"), w >= 160 { s.width = w }
        if let h = num("height"), h >= 100 { s.height = h }
        if let o = num("opacity"), [100.0, 85.0, 70.0].contains(o) { s.opacity = Int(o) }
        if let t = obj["alwaysOnTop"] as? Bool { s.alwaysOnTop = t }
        return s
    }

    func save(_ path: String) {
        func number(_ v: Double?) -> Any { if let v = v { return v.rounded() }; return NSNull() }
        let obj: [String: Any] = [
            "x": number(x), "y": number(y), "width": width.rounded(), "height": height.rounded(),
            "opacity": opacity, "alwaysOnTop": alwaysOnTop,
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys]) else { return }
        try? FileManager.default.createDirectory(atPath: (path as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
        try? data.write(to: URL(fileURLWithPath: path))
    }
}

// MARK: overlay views

struct Edge: OptionSet {
    let rawValue: Int
    static let left = Edge(rawValue: 1), right = Edge(rawValue: 2), top = Edge(rawValue: 4), bottom = Edge(rawValue: 8)
}

/// Top strip: drag with the mouse, menu on right click.
final class StripView: NSView {
    var menu_: NSMenu?
    override func mouseDown(with event: NSEvent) { window?.performDrag(with: event) }
    override func rightMouseDown(with event: NSEvent) {
        if let m = menu_ { NSMenu.popUpContextMenu(m, with: event, for: self) }
    }
}

/// Invisible resize handle on one edge or corner. AppKit's y axis points up, so the top edge is maxY.
final class EdgeView: NSView {
    let edge: Edge
    private var startFrame = NSRect.zero
    private var startMouse = NSPoint.zero

    init(edge: Edge) {
        self.edge = edge
        super.init(frame: .zero)
    }
    required init?(coder: NSCoder) { fatalError("not used") }

    override func resetCursorRects() {
        let cursor: NSCursor = edge == .left || edge == .right ? .resizeLeftRight : edge == .top || edge == .bottom ? .resizeUpDown : .crosshair
        addCursorRect(bounds, cursor: cursor)
    }
    override func mouseDown(with event: NSEvent) {
        guard let w = window else { return }
        startFrame = w.frame
        startMouse = NSEvent.mouseLocation
    }
    override func mouseDragged(with event: NSEvent) {
        guard let w = window else { return }
        let m = NSEvent.mouseLocation
        let dx = m.x - startMouse.x, dy = m.y - startMouse.y
        var f = startFrame
        if edge.contains(.right) { f.size.width = max(minSize.width, startFrame.width + dx) }
        if edge.contains(.left) {
            let width = max(minSize.width, startFrame.width - dx)
            f.origin.x = startFrame.maxX - width
            f.size.width = width
        }
        if edge.contains(.top) { f.size.height = max(minSize.height, startFrame.height + dy) }
        if edge.contains(.bottom) {
            let height = max(minSize.height, startFrame.height - dy)
            f.origin.y = startFrame.maxY - height
            f.size.height = height
        }
        w.setFrame(f, display: true)
    }
}

final class WidgetWindow: NSWindow {
    override var canBecomeKey: Bool { return true }
    override var canBecomeMain: Bool { return true }
}

// MARK: controller

final class Controller: NSObject, WKNavigationDelegate, NSWindowDelegate {
    let url: URL
    let settingsPath: String
    var settings: Settings
    let window: WidgetWindow
    let web = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
    var menu = NSMenu()
    var opacityItems: [NSMenuItem] = []
    var topItem = NSMenuItem()
    var saveTimer: Timer?
    var retryTimer: Timer?
    var placeholder = false

    init(url: URL, settingsPath: String) {
        self.url = url
        self.settingsPath = settingsPath
        let loaded = Settings.load(settingsPath)
        settings = loaded
        window = WidgetWindow(contentRect: Controller.startFrame(loaded), styleMask: [.borderless, .resizable], backing: .buffered, defer: false)
        super.init()

        window.title = "agentsdash"
        window.delegate = self
        window.isReleasedWhenClosed = false
        window.hasShadow = true
        window.backgroundColor = NSColor(white: 0.07, alpha: 1)
        window.minSize = minSize
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.level = settings.alwaysOnTop ? .floating : .normal
        window.alphaValue = CGFloat(settings.opacity) / 100

        let root = NSView(frame: NSRect(origin: .zero, size: window.frame.size))
        web.frame = root.bounds
        web.autoresizingMask = [.width, .height]
        web.navigationDelegate = self
        web.setValue(false, forKey: "drawsBackground")
        root.addSubview(web)
        addOverlays(to: root)
        window.contentView = root

        buildMenu()
        NotificationCenter.default.addObserver(self, selector: #selector(geometryChanged), name: NSWindow.didMoveNotification, object: window)
        NotificationCenter.default.addObserver(self, selector: #selector(geometryChanged), name: NSWindow.didResizeNotification, object: window)
        web.load(URLRequest(url: url))
    }

    /// Contract coordinates are screen pixels from the top-left of the primary screen; AppKit counts from the bottom-left.
    static func startFrame(_ s: Settings) -> NSRect {
        let primary = NSScreen.screens.first?.frame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let size = NSSize(width: s.width, height: s.height)
        if let x = s.x, let y = s.y {
            let want = NSRect(origin: NSPoint(x: x, y: primary.height - y - s.height), size: size)
            if NSScreen.screens.contains(where: { $0.visibleFrame.intersects(want) }) { return want }
        }
        let area = (NSScreen.screens.first ?? NSScreen.main)?.visibleFrame ?? primary
        return NSRect(origin: NSPoint(x: max(area.minX, area.maxX - s.width - 20), y: area.maxY - s.height - 20), size: size)
    }

    func addOverlays(to root: NSView) {
        let w = root.bounds.width, h = root.bounds.height, b = borderWidth
        let strip = StripView(frame: NSRect(x: b, y: h - stripHeight, width: w - 2 * b, height: stripHeight))
        strip.autoresizingMask = [.width, .minYMargin]
        strip.menu_ = menu
        root.addSubview(strip)
        func add(_ edge: Edge, _ frame: NSRect, _ mask: NSView.AutoresizingMask) {
            let v = EdgeView(edge: edge)
            v.frame = frame
            v.autoresizingMask = mask
            root.addSubview(v)
        }
        add(.top, NSRect(x: b, y: h - b, width: w - 2 * b, height: b), [.width, .minYMargin])
        add(.bottom, NSRect(x: b, y: 0, width: w - 2 * b, height: b), [.width, .maxYMargin])
        add(.left, NSRect(x: 0, y: b, width: b, height: h - 2 * b), [.height, .maxXMargin])
        add(.right, NSRect(x: w - b, y: b, width: b, height: h - 2 * b), [.height, .minXMargin])
        add([.top, .left], NSRect(x: 0, y: h - b, width: b, height: b), [.minYMargin, .maxXMargin])
        add([.top, .right], NSRect(x: w - b, y: h - b, width: b, height: b), [.minYMargin, .minXMargin])
        add([.bottom, .left], NSRect(x: 0, y: 0, width: b, height: b), [.maxYMargin, .maxXMargin])
        add([.bottom, .right], NSRect(x: w - b, y: 0, width: b, height: b), [.maxYMargin, .minXMargin])
    }

    func buildMenu() {
        topItem = NSMenuItem(title: "Always on top", action: #selector(toggleTop), keyEquivalent: "")
        topItem.target = self
        topItem.state = settings.alwaysOnTop ? .on : .off
        menu.addItem(topItem)
        for pct in [100, 85, 70] {
            let item = NSMenuItem(title: "Opacity \(pct) %", action: #selector(setOpacity(_:)), keyEquivalent: "")
            item.target = self
            item.tag = pct
            item.state = settings.opacity == pct ? .on : .off
            opacityItems.append(item)
            menu.addItem(item)
        }
        menu.addItem(.separator())
        for (title, action) in [("Reload", #selector(reload)), ("Close", #selector(closeWidget))] {
            let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
            item.target = self
            menu.addItem(item)
        }
    }

    @objc func toggleTop() {
        settings.alwaysOnTop.toggle()
        topItem.state = settings.alwaysOnTop ? .on : .off
        window.level = settings.alwaysOnTop ? .floating : .normal
        saveNow()
    }
    @objc func setOpacity(_ item: NSMenuItem) {
        settings.opacity = item.tag
        window.alphaValue = CGFloat(item.tag) / 100
        for o in opacityItems { o.state = o.tag == item.tag ? .on : .off }
        saveNow()
    }
    @objc func reload() { placeholder = false; web.load(URLRequest(url: url)) }
    @objc func closeWidget() { window.close() }

    // Save at most twice a second while the window moves or resizes.
    @objc func geometryChanged() {
        saveTimer?.invalidate()
        saveTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: false) { [weak self] _ in self?.saveNow() }
    }
    func saveNow() {
        let f = window.frame
        let primaryHeight = NSScreen.screens.first?.frame.height ?? f.maxY
        settings.x = Double(f.minX)
        settings.y = Double(primaryHeight - f.maxY)
        settings.width = Double(f.width)
        settings.height = Double(f.height)
        settings.save(settingsPath)
    }
    func windowWillClose(_ notification: Notification) {
        saveNow()
        NSApp.terminate(nil)
    }

    // MARK: hub unreachable: show a message and probe /health every 3 s

    func showHubDown() {
        placeholder = true
        web.loadHTMLString("<html><body style=\"margin:0;background:#18181c;color:#aaa;font:14px -apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh\">Hub not running</body></html>", baseURL: nil)
        retryTimer?.invalidate()
        retryTimer = Timer.scheduledTimer(withTimeInterval: retrySeconds, repeats: true) { [weak self] _ in self?.probe() }
    }
    func probe() {
        guard let health = URL(string: "health", relativeTo: url) else { return }
        URLSession.shared.dataTask(with: URLRequest(url: health, timeoutInterval: 1.5)) { [weak self] _, response, _ in
            guard let self = self, (response as? HTTPURLResponse)?.statusCode == 200 else { return }
            DispatchQueue.main.async {
                self.retryTimer?.invalidate()
                self.placeholder = false
                self.web.load(URLRequest(url: self.url))
            }
        }.resume()
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if !placeholder { showHubDown() }
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if !placeholder { showHubDown() }
    }
}

// MARK: start

var urlText = "http://127.0.0.1:8765/"
var settingsPath = NSHomeDirectory() + "/.agentsdash/widget.json"
let args = CommandLine.arguments
var i = 1
while i + 1 < args.count {
    if args[i] == "--url" { urlText = args[i + 1] } else if args[i] == "--settings" { settingsPath = args[i + 1] }
    i += 2
}

// One window at a time: a lock file holds the pid of the running widget; a second launch brings that one to the front.
let lockPath = (settingsPath as NSString).deletingLastPathComponent + "/widget.lock"
if let text = try? String(contentsOfFile: lockPath, encoding: .utf8), let pid = Int32(text.trimmingCharacters(in: .whitespacesAndNewlines)),
   pid != getpid(), kill(pid, 0) == 0 {
    NSRunningApplication(processIdentifier: pid)?.activate(options: [.activateIgnoringOtherApps])
    exit(0)
}
try? FileManager.default.createDirectory(atPath: (lockPath as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
try? String(getpid()).write(toFile: lockPath, atomically: true, encoding: .utf8)

guard let pageURL = URL(string: urlText) else {
    FileHandle.standardError.write(Data("Invalid --url\n".utf8))
    exit(1)
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let controller = Controller(url: pageURL, settingsPath: settingsPath)
controller.window.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps: true)
app.run()
try? FileManager.default.removeItem(atPath: lockPath)
