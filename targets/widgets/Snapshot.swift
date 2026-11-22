import Foundation
import WidgetKit

/// The shared space both the app and the widgets can read. Must match app.json,
/// expo-target.config.js and src/lib/widget-storage.ts.
let appGroup = "group.com.gamequarry.plainworth"

/// What the app last handed over: finished text and a few numbers for bars and
/// lines. The app works all of it out (src/lib/widgets.ts), including masking
/// amounts when Hide Amounts is on; the widgets only lay it out.
struct Snapshot: Codable {
  struct Net: Codable {
    var has: Bool
    var value: String
    var month: String
    var monthTone: Int
    var span: String
    var spanLabel: String
    var spanTone: Int
    var lineX: [Double]
    var lineY: [Double]
  }

  struct Spend: Codable {
    var has: Bool
    var month: String
    var spent: String
    var savedLabel: String
    var saved: String
    var savedTone: Int
    var bar: Double
  }

  struct Goal: Codable {
    var has: Bool
    var label: String
    var percent: String
    var progress: Double
    var status: String
    var statusTone: Int
    var reachYear: String
    var toGo: String
  }

  struct Row: Codable {
    var name: String
    var percent: String
    var value: String
    var share: Double
  }

  struct Own: Codable {
    var total: String
    var rows: [Row]
    var debts: String
  }

  /// Made-up numbers for someone without Pro.
  var preview: Bool
  var net: Net
  var spend: Spend
  var goal: Goal
  var own: Own

  /// Nil until the app has been opened once with widgets in it.
  static func load() -> Snapshot? {
    guard let text = UserDefaults(suiteName: appGroup)?.string(forKey: "snapshot"),
      let data = text.data(using: .utf8)
    else { return nil }
    return try? JSONDecoder().decode(Snapshot.self, from: data)
  }

  /// Made-up numbers for the widget gallery, before the app has handed anything over.
  static let sample = Snapshot(
    preview: false,
    net: Net(
      has: true, value: "$153,916", month: "+$2,654 this month", monthTone: 1,
      span: "+$21,384", spanLabel: "Past 6 months", spanTone: 1,
      lineX: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
      lineY: [0, 0.06, 0.04, 0.18, 0.16, 0.34, 0.32, 0.56, 0.68, 0.86, 1]),
    spend: Spend(
      has: true, month: "October", spent: "$2,374", savedLabel: "Saved", saved: "$1,333 · 36%",
      savedTone: 1, bar: 0.64),
    goal: Goal(
      has: true, label: "$1M by 50", percent: "15%", progress: 0.15, status: "On track",
      statusTone: 1, reachYear: "2041", toGo: "$846,084 to go"),
    own: Own(
      total: "$153,916",
      rows: [
        Row(name: "Investments", percent: "67.1%", value: "$119,131", share: 0.671),
        Row(name: "Vehicles", percent: "15.6%", value: "$27,763", share: 0.156),
        Row(name: "Cash", percent: "12.2%", value: "$21,712", share: 0.122),
        Row(name: "Precious Metals", percent: "5.0%", value: "$8,888", share: 0.05),
      ],
      debts: "−$23,578"))
}

struct SnapEntry: TimelineEntry {
  let date: Date
  let snap: Snapshot?
}

/// The app tells the widgets to redraw whenever something changes, so one
/// entry that never expires is all a timeline needs.
struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> SnapEntry {
    SnapEntry(date: Date(), snap: .sample)
  }

  func getSnapshot(in context: Context, completion: @escaping (SnapEntry) -> Void) {
    let saved = Snapshot.load()
    completion(SnapEntry(date: Date(), snap: context.isPreview ? (saved ?? .sample) : saved))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<SnapEntry>) -> Void) {
    completion(Timeline(entries: [SnapEntry(date: Date(), snap: Snapshot.load())], policy: .never))
  }
}
