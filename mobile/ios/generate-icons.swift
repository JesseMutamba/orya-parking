import AppKit
import Foundation

// Original vector-drawn app marks. No downloaded competitor artwork.
let root = URL(fileURLWithPath: CommandLine.arguments[1])
for (target,operations) in [("OryaParking",false),("OryaOperations",true)] {
    let folder = root.appendingPathComponent(target+"/Assets.xcassets/AppIcon.appiconset")
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let canvas = CGContext(data: nil,width: 1024,height: 1024,bitsPerComponent: 8,bytesPerRow: 4096,space: CGColorSpaceCreateDeviceRGB(),bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    let context = NSGraphicsContext(cgContext: canvas, flipped: false)
    NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current = context
    let forest = NSColor(calibratedRed: 0.09,green: 0.25,blue: 0.21,alpha: 1)
    let cream = NSColor(calibratedRed: 0.87,green: 0.92,blue: 0.74,alpha: 1)
    (operations ? cream : forest).setFill();NSBezierPath(rect: NSRect(x: 0,y: 0,width: 1024,height: 1024)).fill()
    let ink = operations ? forest : cream
    let p = NSAttributedString(string: "P",attributes: [.font:NSFont.systemFont(ofSize: 580,weight: .semibold),.foregroundColor:ink])
    let size = p.size();p.draw(at: NSPoint(x: (1024-size.width)/2,y: 220))
    let word = NSAttributedString(string: operations ? "ORYA OPS" : "ORYA",attributes:[.font:NSFont.systemFont(ofSize: 68,weight: .semibold),.foregroundColor:ink,.kern:12])
    word.draw(at: NSPoint(x: (1024-word.size().width)/2,y: 148))
    NSGraphicsContext.restoreGraphicsState()
    let bitmap = NSBitmapImageRep(cgImage: canvas.makeImage()!)
    try bitmap.representation(using: .png,properties: [:])!.write(to: folder.appendingPathComponent("AppIcon.png"))
    let catalog:[String:Any] = ["images":[["filename":"AppIcon.png","idiom":"universal","platform":"ios","size":"1024x1024"]],"info":["author":"Orya","version":1]]
    try JSONSerialization.data(withJSONObject: catalog,options:[.prettyPrinted,.sortedKeys]).write(to: folder.appendingPathComponent("Contents.json"))
    try Data("{\"info\":{\"author\":\"Orya\",\"version\":1}}\n".utf8).write(to: folder.deletingLastPathComponent().appendingPathComponent("Contents.json"))
}
