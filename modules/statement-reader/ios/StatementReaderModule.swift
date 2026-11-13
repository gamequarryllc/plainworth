import ExpoModulesCore
import PDFKit
import UIKit
import Vision

#if canImport(FoundationModels)
import FoundationModels
#endif

internal final class StatementReadException: GenericException<String> {
  override var reason: String {
    param
  }
}

/// Reads the text of a statement on the device: a PDF's own text, or the text
/// in a picture. Each piece of text comes back with where it sits on the page
/// (0 to 1 from the top left), so the lines can be put back together.
/// Nothing here uses the network.
public class StatementReaderModule: Module {
  private static let maxPages = 60

  public func definition() -> ModuleDefinition {
    Name("StatementReader")

    // JSON: [{ page, text, x, y, w, h }]
    AsyncFunction("readPdf") { (uri: String) -> String in
      guard let url = URL(string: uri), let document = PDFDocument(url: url) else {
        throw StatementReadException("open")
      }
      if document.isLocked {
        throw StatementReadException("locked")
      }
      var pieces: [[String: Any]] = []
      let count = min(document.pageCount, StatementReaderModule.maxPages)
      for index in 0..<count {
        guard let page = document.page(at: index) else {
          continue
        }
        let fromText = StatementReaderModule.textPieces(of: page, index: index)
        if !fromText.isEmpty {
          pieces.append(contentsOf: fromText)
          continue
        }
        // A scanned page is only a picture: read it the way a photo is read.
        let box = page.bounds(for: .mediaBox)
        let scale: CGFloat = 2.5
        let size = CGSize(width: max(box.width, 1) * scale, height: max(box.height, 1) * scale)
        let image = page.thumbnail(of: size, for: .mediaBox)
        if let cgImage = image.cgImage {
          pieces.append(contentsOf: try StatementReaderModule.recognize(cgImage, orientation: .up, page: index))
        }
      }
      return try StatementReaderModule.json(pieces)
    }

    // JSON: [{ page, text, x, y, w, h }]
    AsyncFunction("readImage") { (uri: String, page: Int) -> String in
      guard let url = URL(string: uri), let image = UIImage(contentsOfFile: url.path), let cgImage = image.cgImage else {
        throw StatementReadException("open")
      }
      let pieces = try StatementReaderModule.recognize(
        cgImage,
        orientation: StatementReaderModule.orientation(of: image),
        page: page
      )
      return try StatementReaderModule.json(pieces)
    }

    // "available", or why not: "unsupported", "deviceNotEligible", "appleIntelligenceNotEnabled", "modelNotReady".
    AsyncFunction("aiStatus") { () -> String in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        let availability = SystemLanguageModel.default.availability
        if case .available = availability {
          return "available"
        }
        if case .unavailable(let why) = availability {
          return String(describing: why)
        }
      }
      #endif
      return "unsupported"
    }

    // One question to the on-device model, one answer. Each call starts fresh.
    AsyncFunction("aiAsk") { (instructions: String, prompt: String) async throws -> String in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        let session = LanguageModelSession(instructions: instructions)
        let response = try await session.respond(to: prompt)
        return response.content
      }
      #endif
      throw StatementReadException("unsupported")
    }
  }

  private static func json(_ pieces: [[String: Any]]) throws -> String {
    let data = try JSONSerialization.data(withJSONObject: pieces, options: [])
    return String(data: data, encoding: .utf8) ?? "[]"
  }

  private static func piece(page: Int, text: String, x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat) -> [String: Any] {
    return ["page": page, "text": text, "x": Double(x), "y": Double(y), "w": Double(w), "h": Double(h)]
  }

  /// The page's own text, line by line.
  private static func textPieces(of page: PDFPage, index: Int) -> [[String: Any]] {
    guard let whole = page.string, !whole.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      return []
    }
    let box = page.bounds(for: .mediaBox)
    var pieces: [[String: Any]] = []
    if box.width > 0, box.height > 0, let selection = page.selection(for: box) {
      for line in selection.selectionsByLine() {
        guard let text = line.string?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else {
          continue
        }
        let bounds = line.bounds(for: page)
        if bounds.width <= 0 || bounds.height <= 0 {
          continue
        }
        pieces.append(piece(
          page: index,
          text: text,
          x: (bounds.minX - box.minX) / box.width,
          y: 1 - (bounds.maxY - box.minY) / box.height,
          w: bounds.width / box.width,
          h: bounds.height / box.height
        ))
      }
    }
    if !pieces.isEmpty {
      return pieces
    }
    // No positions to be had: keep the lines in the order the PDF gives them.
    let lines = whole.components(separatedBy: .newlines).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
    let step = 1.0 / CGFloat(max(lines.count, 1))
    for (number, line) in lines.enumerated() {
      pieces.append(piece(page: index, text: line, x: 0, y: CGFloat(number) * step, w: 1, h: step * 0.8))
    }
    return pieces
  }

  /// The text in a picture, with Apple's on-device text recognition.
  private static func recognize(_ image: CGImage, orientation: CGImagePropertyOrientation, page: Int) throws -> [[String: Any]] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    // Merchant names and amounts aren't words; "correcting" them makes them worse.
    request.usesLanguageCorrection = false
    let handler = VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:])
    try handler.perform([request])
    var pieces: [[String: Any]] = []
    for observation in request.results ?? [] {
      guard let best = observation.topCandidates(1).first else {
        continue
      }
      let box = observation.boundingBox
      pieces.append(piece(page: page, text: best.string, x: box.minX, y: 1 - box.maxY, w: box.width, h: box.height))
    }
    return pieces
  }

  private static func orientation(of image: UIImage) -> CGImagePropertyOrientation {
    switch image.imageOrientation {
    case .up: return .up
    case .down: return .down
    case .left: return .left
    case .right: return .right
    case .upMirrored: return .upMirrored
    case .downMirrored: return .downMirrored
    case .leftMirrored: return .leftMirrored
    case .rightMirrored: return .rightMirrored
    @unknown default: return .up
    }
  }
}
