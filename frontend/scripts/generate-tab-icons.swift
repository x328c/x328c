import AppKit
import Foundation

let iconSize = 81
let outputDirectory = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
    .appendingPathComponent("src/assets/tabbar", isDirectory: true)

func color(hex: UInt32) -> NSColor {
    NSColor(
        red: CGFloat((hex >> 16) & 0xff) / 255,
        green: CGFloat((hex >> 8) & 0xff) / 255,
        blue: CGFloat(hex & 0xff) / 255,
        alpha: 1
    )
}

func path(_ points: [NSPoint], close: Bool = false) -> NSBezierPath {
    let value = NSBezierPath()
    guard let first = points.first else { return value }
    value.move(to: first)
    points.dropFirst().forEach { value.line(to: $0) }
    if close { value.close() }
    return value
}

func style(_ value: NSBezierPath, stroke: NSColor, width: CGFloat = 5) {
    value.lineWidth = width
    value.lineCapStyle = .round
    value.lineJoinStyle = .round
    stroke.setStroke()
    value.stroke()
}

func circle(center: NSPoint, radius: CGFloat, stroke: NSColor, fill: Bool = false) {
    let value = NSBezierPath(ovalIn: NSRect(
        x: center.x - radius,
        y: center.y - radius,
        width: radius * 2,
        height: radius * 2
    ))
    if fill {
        stroke.setFill()
        value.fill()
    } else {
        style(value, stroke: stroke)
    }
}

typealias IconDrawer = (NSColor) -> Void

let icons: [(String, IconDrawer)] = [
    ("ride", { stroke in
        circle(center: NSPoint(x: 20, y: 25), radius: 12, stroke: stroke)
        circle(center: NSPoint(x: 61, y: 25), radius: 12, stroke: stroke)
        style(path([NSPoint(x: 20, y: 25), NSPoint(x: 34, y: 44), NSPoint(x: 49, y: 25), NSPoint(x: 20, y: 25)]), stroke: stroke)
        style(path([NSPoint(x: 34, y: 44), NSPoint(x: 55, y: 44), NSPoint(x: 61, y: 25)]), stroke: stroke)
        style(path([NSPoint(x: 29, y: 52), NSPoint(x: 39, y: 52)]), stroke: stroke)
    }),
    ("route", { stroke in
        circle(center: NSPoint(x: 19, y: 19), radius: 7, stroke: stroke)
        circle(center: NSPoint(x: 62, y: 62), radius: 7, stroke: stroke)
        let route = NSBezierPath()
        route.move(to: NSPoint(x: 24, y: 24))
        route.curve(to: NSPoint(x: 57, y: 57), controlPoint1: NSPoint(x: 62, y: 25), controlPoint2: NSPoint(x: 20, y: 54))
        style(route, stroke: stroke)
    }),
    ("forum", { stroke in
        let bubble = NSBezierPath(roundedRect: NSRect(x: 12, y: 20, width: 57, height: 43), xRadius: 10, yRadius: 10)
        style(bubble, stroke: stroke)
        style(path([NSPoint(x: 26, y: 21), NSPoint(x: 19, y: 11), NSPoint(x: 39, y: 21)]), stroke: stroke)
        circle(center: NSPoint(x: 29, y: 42), radius: 2.7, stroke: stroke, fill: true)
        circle(center: NSPoint(x: 41, y: 42), radius: 2.7, stroke: stroke, fill: true)
        circle(center: NSPoint(x: 53, y: 42), radius: 2.7, stroke: stroke, fill: true)
    }),
    ("messages", { stroke in
        let envelope = NSBezierPath(roundedRect: NSRect(x: 11, y: 18, width: 59, height: 45), xRadius: 7, yRadius: 7)
        style(envelope, stroke: stroke)
        style(path([NSPoint(x: 14, y: 58), NSPoint(x: 40.5, y: 37), NSPoint(x: 68, y: 58)]), stroke: stroke)
    }),
    ("profile", { stroke in
        circle(center: NSPoint(x: 40.5, y: 54), radius: 12, stroke: stroke)
        let shoulders = NSBezierPath()
        shoulders.move(to: NSPoint(x: 17, y: 15))
        shoulders.curve(to: NSPoint(x: 64, y: 15), controlPoint1: NSPoint(x: 20, y: 39), controlPoint2: NSPoint(x: 61, y: 39))
        style(shoulders, stroke: stroke)
    }),
]

try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)

for (name, draw) in icons {
    for (suffix, stroke) in [("", color(hex: 0x8c8c8c)), ("-selected", color(hex: 0xff6a00))] {
        guard let bitmap = NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: iconSize,
            pixelsHigh: iconSize,
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: true,
            isPlanar: false,
            colorSpaceName: .deviceRGB,
            bytesPerRow: 0,
            bitsPerPixel: 0
        ), let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
            fatalError("无法创建图标画布")
        }

        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = context
        NSColor.clear.setFill()
        NSRect(x: 0, y: 0, width: iconSize, height: iconSize).fill()
        draw(stroke)
        context.flushGraphics()
        NSGraphicsContext.restoreGraphicsState()

        guard let png = bitmap.representation(using: .png, properties: [:]) else {
            fatalError("无法编码 PNG 图标")
        }
        try png.write(to: outputDirectory.appendingPathComponent("\(name)\(suffix).png"))
    }
}

print("已生成 \(icons.count * 2) 个 TabBar PNG 图标")
