import { potluckWhen } from "./dates";

/**
 * The text sent with an invite link. The link itself is added by the share
 * sheet (and shows up as a preview card in most messaging apps).
 */
export function inviteMessage(potluck: {
  title: string;
  startsAt?: any;
  timeTbd?: boolean;
  location?: string;
  theme?: string;
  inviteCode: string;
}): string {
  const when = potluckWhen(potluck);
  return [
    `🍲 Come join my potluck, “${potluck.title}”!`,
    potluck.theme ? `🏆 Theme: ${potluck.theme}` : null,
    when ? `📅 ${when}` : null,
    potluck.location ? `📍 ${potluck.location}` : null,
    "",
    "Bring a dish, rate everyone’s food, and help crown the winner. Join right from your browser, no app needed.",
    `Invite code: ${potluck.inviteCode}`,
  ]
    .filter((line) => line != null)
    .join("\n");
}
