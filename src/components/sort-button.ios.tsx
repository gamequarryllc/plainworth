import { Host, Image, Menu, Section, Toggle } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  menuIndicator,
  menuStyle,
  padding,
} from "@expo/ui/swift-ui/modifiers";
import { useColorScheme } from "react-native";

import { haptics } from "@/lib/haptics";
import { NW_SORTS } from "@/lib/sort";
import { useColors } from "@/theme";

import type { SortButtonProps } from "./sort-button.types";

/** A small sort icon for a list header; tapping it opens the Sort By menu, checkmark on the current pick. */
export function SortButton({ value, onChange }: SortButtonProps) {
  const c = useColors();
  const scheme = useColorScheme();
  return (
    <Host
      style={styles.host}
      alignment="trailing"
      colorScheme={scheme === "dark" ? "dark" : "light"}
    >
      <Menu
        label={
          <Image
            systemName="arrow.up.arrow.down"
            size={13}
            color={c.secondary}
            modifiers={[padding({ vertical: 4, leading: 10 })]}
          />
        }
        modifiers={[
          menuStyle("button"),
          buttonStyle("plain"),
          menuIndicator("hidden"),
        ]}
      >
        <Section title="Sort By">
          {NW_SORTS.map((o) => (
            <Toggle
              key={o.key}
              label={o.title}
              isOn={o.key === value}
              onIsOnChange={() => {
                haptics.selection();
                onChange(o.key);
              }}
            />
          ))}
        </Section>
      </Menu>
    </Host>
  );
}

const styles = {
  host: { width: 30, height: 22, marginVertical: -4 },
};
