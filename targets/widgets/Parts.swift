import SwiftUI
import UIKit
import WidgetKit

/// The app's colors, each with a light and a dark version.
enum Palette {
  static func pair(_ light: UInt32, _ dark: UInt32) -> Color {
    Color(
      UIColor { traits in
        let hex = traits.userInterfaceStyle == .dark ? dark : light
        return UIColor(
          red: CGFloat((hex >> 16) & 0xFF) / 255,
          green: CGFloat((hex >> 8) & 0xFF) / 255,
          blue: CGFloat(hex & 0xFF) / 255,
          alpha: 1)
      })
  }

  static let surface = pair(0xFFFFFF, 0x1C1C1E)
  static let text = pair(0x111113, 0xFFFFFF)
  static let secondary = pair(0x5F5F66, 0xA4A4AC)
  static let track = pair(0xE6E7EC, 0x333338)
  /// Green and red for words; the brighter ones are for lines and bars.
  static let gain = pair(0x18803A, 0x30D158)
  static let loss = pair(0xC4291C, 0xFF453A)
  static let green = pair(0x34C759, 0x30D158)
  static let red = pair(0xFF3B30, 0xFF453A)
  static let blue = pair(0x0A6CFF, 0x0A84FF)
  static let orange = pair(0xFF9500, 0xFF9F0A)
  static let purple = pair(0xAF52DE, 0xBF5AF2)
  /// What You Own, biggest first.
  static let kinds = [blue, green, orange, purple]

  /// 1 good, -1 bad, 0 plain.
  static func word(_ tone: Int) -> Color {
    tone > 0 ? gain : tone < 0 ? loss : secondary
  }

  static func line(_ tone: Int) -> Color {
    tone < 0 ? red : green
  }
}

/// Small bold label: titles and the lines under an amount.
struct Caption: View {
  let text: String
  var color: Color = Palette.secondary

  init(_ text: String, _ color: Color = Palette.secondary) {
    self.text = text
    self.color = color
  }

  var body: some View {
    Text(text)
      .font(.system(size: 12, weight: .semibold))
      .foregroundStyle(color)
      .lineLimit(1)
      .minimumScaleFactor(0.7)
  }
}

/// A big amount. Hidden by iOS while the phone is locked.
struct Amount: View {
  let text: String
  var size: CGFloat = 27
  var color: Color = Palette.text

  init(_ text: String, size: CGFloat = 27, color: Color = Palette.text) {
    self.text = text
    self.size = size
    self.color = color
  }

  var body: some View {
    Text(text)
      .font(.system(size: size, weight: .bold))
      .tracking(-0.5)
      .foregroundStyle(color)
      .lineLimit(1)
      .minimumScaleFactor(0.5)
      .privacySensitive()
  }
}

/// Marks made-up numbers shown to someone without Pro.
struct PreviewBadge: View {
  var body: some View {
    Text("Preview · Get Pro")
      .font(.system(size: 11, weight: .semibold))
      .foregroundStyle(Color.white)
      .lineLimit(1)
      .fixedSize()
      .padding(.horizontal, 8)
      .padding(.vertical, 3)
      .background(Capsule().fill(Palette.blue))
  }
}

/// The top row: the widget's title, or the Preview badge in its place.
struct Header: View {
  let title: String
  let preview: Bool
  /// What sits on the right when it isn't a preview.
  var trailing: String = ""

  var body: some View {
    HStack(spacing: 6) {
      if preview {
        PreviewBadge()
        Spacer(minLength: 0)
      } else {
        Caption(title)
        Spacer(minLength: 0)
        if !trailing.isEmpty { Caption(trailing) }
      }
    }
  }
}

struct Rule: View {
  var body: some View {
    Rectangle().fill(Palette.track).frame(height: 1)
  }
}

/// A net worth line, oldest on the left. Points are 0 to 1 both ways.
struct LineChart: View {
  let xs: [Double]
  let ys: [Double]
  let color: Color
  var filled: Bool = true

  private func points(_ size: CGSize) -> [CGPoint] {
    let count = min(xs.count, ys.count)
    let inset: CGFloat = 2
    var out: [CGPoint] = []
    for i in 0..<count {
      let x = inset + CGFloat(xs[i]) * (size.width - inset * 2)
      let y = inset + (1 - CGFloat(ys[i])) * (size.height - inset * 2)
      out.append(CGPoint(x: x, y: y))
    }
    return out
  }

  private func stroke(_ pts: [CGPoint]) -> Path {
    var path = Path()
    guard let first = pts.first else { return path }
    path.move(to: first)
    for p in pts.dropFirst() { path.addLine(to: p) }
    return path
  }

  private func area(_ pts: [CGPoint], _ height: CGFloat) -> Path {
    var path = stroke(pts)
    guard let first = pts.first, let last = pts.last else { return path }
    path.addLine(to: CGPoint(x: last.x, y: height))
    path.addLine(to: CGPoint(x: first.x, y: height))
    path.closeSubpath()
    return path
  }

  var body: some View {
    GeometryReader { geo in
      let pts = points(geo.size)
      ZStack {
        if filled {
          area(pts, geo.size.height).fill(color.opacity(0.14))
        }
        stroke(pts).stroke(color, style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
      }
    }
  }
}

/// A progress bar, 0 to 1.
struct Bar: View {
  let value: Double
  let color: Color
  var height: CGFloat = 10

  var body: some View {
    GeometryReader { geo in
      let share = CGFloat(min(max(value, 0), 1))
      ZStack(alignment: .leading) {
        Capsule().fill(Palette.track)
        Capsule().fill(color).frame(width: max(height, geo.size.width * share))
      }
    }
    .frame(height: height)
  }
}

/// A progress ring with the percentage in the middle.
struct Ring: View {
  let value: Double
  let label: String

  var body: some View {
    ZStack {
      Circle().stroke(Palette.track, lineWidth: 9)
      Circle()
        .trim(from: 0, to: CGFloat(min(max(value, 0.01), 1)))
        .stroke(Palette.green, style: StrokeStyle(lineWidth: 9, lineCap: .round))
        .rotationEffect(.degrees(-90))
      Text(label)
        .font(.system(size: 20, weight: .bold))
        .foregroundStyle(Palette.text)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
        .padding(.horizontal, 12)
    }
    .padding(5)
  }
}

/// One bar split by share, for What You Own.
struct SplitBar: View {
  let shares: [Double]
  var height: CGFloat = 18

  var body: some View {
    GeometryReader { geo in
      let gaps = CGFloat(max(shares.count - 1, 0)) * 2
      let total = max(shares.reduce(0, +), 0.0001)
      HStack(spacing: 2) {
        ForEach(0..<shares.count, id: \.self) { i in
          Rectangle()
            .fill(Palette.kinds[i % Palette.kinds.count])
            .frame(width: max(0, (geo.size.width - gaps) * CGFloat(shares[i] / total)))
        }
      }
    }
    .frame(height: height)
    .clipShape(Capsule())
  }
}

/// Shown in place of a widget that has nothing to show yet.
struct Message: View {
  let title: String
  let text: String

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Caption(title)
      Spacer(minLength: 0)
      Text(text)
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(Palette.text)
        .lineLimit(3)
        .minimumScaleFactor(0.8)
      Spacer(minLength: 0)
    }
  }
}

/// What every widget shares: the background, where a tap goes, and what shows
/// when there's nothing to draw yet. A preview always has numbers, and a tap
/// on it opens the Pro page.
struct Shell<Content: View>: View {
  let snap: Snapshot?
  let title: String
  /// Why there's nothing to show, or nil when there is.
  let missing: (Snapshot) -> String?
  /// Where a tap goes.
  let link: (Snapshot) -> String
  @ViewBuilder let content: (Snapshot) -> Content

  private var url: URL? {
    guard let snap = snap else { return URL(string: "plainworth://") }
    return URL(string: snap.preview ? "plainworth://pro" : link(snap))
  }

  var body: some View {
    Group {
      if let snap = snap {
        if let why = missing(snap), !snap.preview {
          Message(title: title, text: why)
        } else {
          content(snap)
        }
      } else {
        Message(title: title, text: "Open Plainworth to start")
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .widgetURL(url)
    .containerBackground(for: .widget) { Palette.surface }
  }
}
