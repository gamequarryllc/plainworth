// What the home screen widgets show for the App Store screenshot of them: the same
// 3-year sample the other screenshots use, with a net worth goal set so the goal
// widgets have something to draw. Printed as JSON for tools/store_shots_widgets.cjs.
//
//   npx tsx tools/store_shots_widget_data.ts > widgets.json

import { todayKey } from '@/lib/dates';
import { widgetSnapshot } from '@/lib/widgets';
import { emptyData } from '@/store/defaults';
import { sampleData } from '@/store/sample';

const data = sampleData(36);
data.settings = {
  ...emptyData().settings,
  ...data.settings,
  goal: { amount: 500_000_00, age: 45 },
  birthYear: new Date().getFullYear() - 36,
};
process.stdout.write(JSON.stringify(widgetSnapshot(data, todayKey())));
