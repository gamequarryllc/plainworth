import SwiftUI
import WidgetKit

@main
struct PlainworthWidgetBundle: WidgetBundle {
  var body: some Widget {
    NetWorthSmallWidget()
    SpendingSmallWidget()
    GoalSmallWidget()
    NetWorthChartWidget()
    NetWorthSpendingWidget()
    GoalMediumWidget()
    GlanceWidget()
    OwnWidget()
  }
}
