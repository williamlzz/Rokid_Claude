#!/usr/bin/env swift
import Foundation
import CoreImage
import AppKit

let args = CommandLine.arguments
if args.count < 2 {
    fputs("usage: make-qr.swift OUTPUT.png < input.txt\n", stderr)
    exit(2)
}
let out = args[1]
let input = FileHandle.standardInput.readDataToEndOfFile()
guard !input.isEmpty else {
    fputs("empty QR input\n", stderr)
    exit(2)
}
let filter = CIFilter(name: "CIQRCodeGenerator")!
filter.setValue(input, forKey: "inputMessage")
filter.setValue("M", forKey: "inputCorrectionLevel")
guard let qr = filter.outputImage else {
    fputs("failed to generate QR\n", stderr)
    exit(1)
}
let scale = 10.0
let transformed = qr.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
let rep = NSCIImageRep(ciImage: transformed)
let image = NSImage(size: rep.size)
image.addRepresentation(rep)
guard let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:]) else {
    fputs("failed to encode PNG\n", stderr)
    exit(1)
}
try png.write(to: URL(fileURLWithPath: out), options: .atomic)
