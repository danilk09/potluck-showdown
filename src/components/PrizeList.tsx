import { Text } from "react-native";
import { Stack, Tile } from "./ui";
import { colors, type } from "../theme";

export const PRIZE_PLACES = ["🥇 1st", "🥈 2nd", "🥉 3rd"];

/** Prizes the host is offering. Nothing renders when there are none. */
export default function PrizeList({ prizes, style }: { prizes?: string[] | null; style?: any }) {
  const offered = (prizes ?? []).map((p, i) => [PRIZE_PLACES[i], p?.trim()]).filter(([, p]) => p);
  if (!offered.length) return null;
  return (
    <Tile tone="gold" style={[{ padding: 14 }, style]}>
      <Text style={[type.body, type.bold, { marginBottom: 4 }]}>🎁 Prizes from the host</Text>
      <Stack gap={2}>
        {offered.map(([place, prize]) => (
          <Text key={place} style={type.small}>
            <Text style={type.bold}>{place}:</Text> {prize}
          </Text>
        ))}
      </Stack>
      <Text style={[type.small, { color: colors.muted, marginTop: 6 }]}>Provided by the host, not by Potluck Showdown.</Text>
    </Tile>
  );
}
