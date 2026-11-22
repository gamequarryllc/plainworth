import SwiftUI
import WidgetKit

// Where a tap on a widget opens the app.
private let netWorthLink = "plainworth://"
private let spendingLink = "plainworth://spending"
private let insightsLink = "plainworth://insights"
private let goalLink = "plainworth://goal"

private let needsBalance = "Add a balance in Plainworth to see it here"
private let needsSpending = "Add a month of spending to see it here"
private let needsGoal = "Set a goal"

private func noBalance(_ s: Snapshot) -> String? { s.net.has ? nil : needsBalance }
private func noSpending(_ s: Snapshot) -> String? { s.spend.has ? nil : needsSpending }
private func noGoal(_ s: Snapshot) -> String? {
  if !s.net.has { return needsBalance }
  return s.goal.has ? nil : needsGoal
}

/// "Saved $1,333 · 36%"
private func savedLine(_ s: Snapshot) -> String {
  s.spend.savedLabel.isEmpty ? "" : "\(s.spend.savedLabel) \(s.spend.saved)"
}

/// "2041 at your pace"
private func paceLine(_ s: Snapshot) -> String {
  s.goal.reachYear.isEmpty ? "" : "\(s.goal.reachYear) at your pace"
}

private func joined(_ parts: [String]) -> String {
  parts.filter { !$0.isEmpty }.joined(separator: " · ")
}

// MARK: Small

/// Net worth, how it moved this month, and a line.
struct NetWorthSmallView: View {
  let snap: Snapshot?

  var body: some View {
    Shell(snap: snap, title: "Net Worth", missing: noBalance, link: { _ in netWorthLink }) { s in
      VStack(alignment: .leading, spacing: 0) {
        Header(title: "Net Worth", preview: s.preview)
        Amount(s.net.value).padding(.top, 4)
        Caption(s.net.month, Palette.word(s.net.monthTone)).padding(.top, 2)
        Spacer(minLength: 8)
        LineChart(xs: s.net.lineX, ys: s.net.lineY, color: Palette.line(s.net.spanTone), filled: false)
          .frame(height: 42)
      }
    }
  }
}

/// Last month: spent, how much of what was earned that is, and what was saved.
struct SpendingSmallView: View {
  let snap: Snapshot?

  var body: some View {
    Shell(snap: snap, title: "Spending", missing: noSpending, link: { _ in spendingLink }) { s in
      VStack(alignment: .leading, spacing: 0) {
        Header(title: s.spend.month, preview: s.preview)
        Amount(s.spend.spent).padding(.top, 4)
        Caption("spent").padding(.top, 2)
        Spacer(minLength: 8)
        if s.spend.bar >= 0 {
          Bar(value: s.spend.bar, color: Palette.blue)
        }
        Caption(savedLine(s), Palette.word(s.spend.savedTone)).padding(.top, 8)
      }
    }
  }
}

/// How far along the net worth goal is.
struct GoalSmallView: View {
  let snap: Snapshot?

  private func bottom(_ s: Snapshot) -> String {
    if !s.goal.reachYear.isEmpty { return "On pace for \(s.goal.reachYear)" }
    return s.goal.status.isEmpty ? s.goal.toGo : s.goal.status
  }

  var body: some View {
    Shell(
      snap: snap, title: "Goal", missing: noGoal,
      link: { s in s.goal.has ? insightsLink : goalLink }
    ) { s in
      VStack(alignment: .leading, spacing: 0) {
        Header(title: "Goal · \(s.goal.label)", preview: s.preview)
        Ring(value: s.goal.progress, label: s.goal.percent)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .padding(.vertical, 6)
        Caption(bottom(s), Palette.word(s.goal.statusTone))
          .frame(maxWidth: .infinity, alignment: .center)
      }
    }
  }
}

// MARK: Medium

/// Net worth with a six-month chart.
struct NetWorthChartView: View {
  let snap: Snapshot?

  var body: some View {
    Shell(snap: snap, title: "Net Worth", missing: noBalance, link: { _ in netWorthLink }) { s in
      HStack(spacing: 14) {
        VStack(alignment: .leading, spacing: 0) {
          Header(title: "Net Worth", preview: s.preview)
          Amount(s.net.value).padding(.top, 4)
          Caption(s.net.span, Palette.word(s.net.spanTone)).padding(.top, 2)
          Spacer(minLength: 4)
          Caption(s.net.spanLabel)
        }
        .frame(width: 132, alignment: .leading)
        LineChart(xs: s.net.lineX, ys: s.net.lineY, color: Palette.line(s.net.spanTone))
      }
    }
  }
}

/// Net worth on the left, last month's spending on the right.
struct NetWorthSpendingView: View {
  let snap: Snapshot?

  private func missing(_ s: Snapshot) -> String? {
    s.net.has || s.spend.has ? nil : needsBalance
  }

  var body: some View {
    Shell(snap: snap, title: "Net Worth", missing: missing, link: { _ in netWorthLink }) { s in
      HStack(spacing: 14) {
        VStack(alignment: .leading, spacing: 0) {
          Caption("Net Worth")
          if s.net.has {
            Amount(s.net.value, size: 24).padding(.top, 4)
            Caption(s.net.month, Palette.word(s.net.monthTone)).padding(.top, 2)
            Spacer(minLength: 6)
            LineChart(xs: s.net.lineX, ys: s.net.lineY, color: Palette.line(s.net.spanTone), filled: false)
              .frame(height: 36)
          } else {
            Spacer(minLength: 0)
            Caption("Add a balance")
            Spacer(minLength: 0)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        Rectangle().fill(Palette.track).frame(width: 1)
        VStack(alignment: .leading, spacing: 0) {
          Header(title: s.spend.has ? s.spend.month : "Spending", preview: s.preview)
          if s.spend.has {
            Amount(s.spend.spent, size: 24).padding(.top, 4)
            Caption("spent").padding(.top, 2)
            Spacer(minLength: 6)
            Caption(savedLine(s), Palette.word(s.spend.savedTone))
          } else {
            Spacer(minLength: 0)
            Caption("Add a month of spending")
            Spacer(minLength: 0)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
  }
}

/// The goal as a bar, with what's left and when the current pace gets there.
struct GoalMediumView: View {
  let snap: Snapshot?

  var body: some View {
    Shell(
      snap: snap, title: "Goal", missing: noGoal,
      link: { s in s.goal.has ? insightsLink : goalLink }
    ) { s in
      VStack(alignment: .leading, spacing: 0) {
        HStack(spacing: 6) {
          Caption("Goal · \(s.goal.label)")
          Spacer(minLength: 0)
          if s.preview { PreviewBadge() } else { Caption(s.goal.percent) }
        }
        Amount(s.net.value).padding(.top, 4)
        Bar(value: s.goal.progress, color: Palette.green).padding(.top, 12)
        Spacer(minLength: 6)
        HStack(spacing: 6) {
          Caption(joined([s.preview ? s.goal.percent : "", s.goal.status]), Palette.word(s.goal.statusTone))
          Spacer(minLength: 0)
          Caption(joined([s.goal.toGo, paceLine(s)]))
        }
      }
    }
  }
}

// MARK: Large

/// Net worth with its chart, last month's spending, and the goal.
struct GlanceView: View {
  let snap: Snapshot?

  var body: some View {
    Shell(snap: snap, title: "Net Worth", missing: noBalance, link: { _ in netWorthLink }) { s in
      VStack(alignment: .leading, spacing: 0) {
        Header(title: "Net Worth", preview: s.preview)
        HStack(alignment: .firstTextBaseline, spacing: 10) {
          Amount(s.net.value, size: 30)
          Caption(s.net.month, Palette.word(s.net.monthTone))
        }
        .padding(.top, 4)
        LineChart(xs: s.net.lineX, ys: s.net.lineY, color: Palette.line(s.net.spanTone))
          .frame(maxHeight: .infinity)
          .padding(.top, 10)
        Rule().padding(.top, 14)
        if s.spend.has {
          HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 2) {
              Caption("\(s.spend.month) spent")
              Amount(s.spend.spent, size: 20)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
              Caption(s.spend.savedLabel.isEmpty ? "Saved" : s.spend.savedLabel)
              Amount(
                s.spend.saved.isEmpty ? "—" : s.spend.saved, size: 20,
                color: s.spend.saved.isEmpty ? Palette.secondary : Palette.word(s.spend.savedTone))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
          }
          .padding(.top, 12)
        } else {
          Caption(needsSpending).padding(.top, 12)
        }
        Rule().padding(.top, 12)
        if s.goal.has {
          HStack(spacing: 6) {
            Caption("Goal · \(s.goal.label)")
            Spacer(minLength: 0)
            Caption(s.goal.percent)
          }
          .padding(.top, 12)
          Bar(value: s.goal.progress, color: Palette.green).padding(.top, 8)
          Caption(joined([s.goal.status, paceLine(s)]), Palette.word(s.goal.statusTone)).padding(.top, 10)
        } else {
          Caption("Set a goal in Plainworth to follow it here").padding(.top, 12)
        }
      }
    }
  }
}

/// What the assets are made of, by kind, and what's owed.
struct OwnView: View {
  let snap: Snapshot?

  var body: some View {
    Shell(snap: snap, title: "What You Own", missing: noBalance, link: { _ in netWorthLink }) { s in
      VStack(alignment: .leading, spacing: 0) {
        Header(title: "What You Own", preview: s.preview)
        Amount(s.own.total, size: 30).padding(.top, 4)
        SplitBar(shares: s.own.rows.map { $0.share }).padding(.top, 14)
        VStack(spacing: 0) {
          ForEach(0..<s.own.rows.count, id: \.self) { i in
            if i > 0 { Rule() }
            OwnRow(
              color: Palette.kinds[i % Palette.kinds.count], name: s.own.rows[i].name,
              percent: s.own.rows[i].percent, value: s.own.rows[i].value, valueColor: Palette.text)
          }
          if !s.own.debts.isEmpty {
            Rule()
            OwnRow(color: Palette.red, name: "Debts", percent: "", value: s.own.debts, valueColor: Palette.loss)
          }
        }
        .padding(.top, 10)
        Spacer(minLength: 0)
      }
    }
  }
}

private struct OwnRow: View {
  let color: Color
  let name: String
  let percent: String
  let value: String
  let valueColor: Color

  var body: some View {
    HStack(spacing: 8) {
      Circle().fill(color).frame(width: 10, height: 10)
      Text(name)
        .font(.system(size: 14))
        .foregroundStyle(Palette.text)
        .lineLimit(1)
      Spacer(minLength: 4)
      Text(percent)
        .font(.system(size: 14))
        .foregroundStyle(Palette.secondary)
        .lineLimit(1)
      if !value.isEmpty {
        Text(value)
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(valueColor)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
          .frame(width: 82, alignment: .trailing)
          .privacySensitive()
      }
    }
    .frame(maxHeight: 46)
  }
}

// MARK: The widgets, as the iPhone's widget gallery lists them

struct NetWorthSmallWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NetWorthSmall", provider: Provider()) { entry in
      NetWorthSmallView(snap: entry.snap)
    }
    .configurationDisplayName("Net Worth")
    .description("Your net worth and how it moved this month.")
    .supportedFamilies([.systemSmall])
  }
}

struct SpendingSmallWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "SpendingSmall", provider: Provider()) { entry in
      SpendingSmallView(snap: entry.snap)
    }
    .configurationDisplayName("Last Month")
    .description("What you spent and saved last month.")
    .supportedFamilies([.systemSmall])
  }
}

struct GoalSmallWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "GoalSmall", provider: Provider()) { entry in
      GoalSmallView(snap: entry.snap)
    }
    .configurationDisplayName("Goal")
    .description("How far along your net worth goal is.")
    .supportedFamilies([.systemSmall])
  }
}

struct NetWorthChartWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NetWorthChart", provider: Provider()) { entry in
      NetWorthChartView(snap: entry.snap)
    }
    .configurationDisplayName("Net Worth Chart")
    .description("Your net worth over the past six months.")
    .supportedFamilies([.systemMedium])
  }
}

struct NetWorthSpendingWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NetWorthSpending", provider: Provider()) { entry in
      NetWorthSpendingView(snap: entry.snap)
    }
    .configurationDisplayName("Net Worth and Spending")
    .description("Your net worth beside last month's spending.")
    .supportedFamilies([.systemMedium])
  }
}

struct GoalMediumWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "GoalMedium", provider: Provider()) { entry in
      GoalMediumView(snap: entry.snap)
    }
    .configurationDisplayName("Goal Progress")
    .description("Your net worth goal, what's left, and when you'll get there.")
    .supportedFamilies([.systemMedium])
  }
}

struct GlanceWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "Glance", provider: Provider()) { entry in
      GlanceView(snap: entry.snap)
    }
    .configurationDisplayName("At a Glance")
    .description("Net worth, last month's spending and your goal.")
    .supportedFamilies([.systemLarge])
  }
}

struct OwnWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "Own", provider: Provider()) { entry in
      OwnView(snap: entry.snap)
    }
    .configurationDisplayName("What You Own")
    .description("What your assets are made of, and what you owe.")
    .supportedFamilies([.systemLarge])
  }
}
