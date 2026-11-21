import { useState } from "react";
import { Text, View } from "react-native";
import { dismissFeedbackPrompt, friendlyError, submitFeedback } from "../data/api";
import { Banner, Button, Chip, ChipToggleGroup, Dialog, Input, Label, Row, Stack, StarRating, useToast } from "./ui";
import { type } from "../theme";

const RATING_REASONS = ["Easy to use", "Fun challenges", "Voting was unclear", "App issues"];

/**
 * The quick "How was your experience?" popup, shown after a potluck the user
 * attended publishes its results. `potluckIds` are all the finished potlucks it
 * answers for, so it isn't shown again for any of them.
 */
export default function FeedbackPrompt({ potluckIds, onDone }: { potluckIds: string[]; onDone: () => void }) {
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [reasons, setReasons] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const notNow = () => {
    dismissFeedbackPrompt(potluckIds).catch(() => {});
    onDone();
  };

  const send = async (withDetails: boolean) => {
    setBusy(withDetails ? "send" : "plain");
    setError("");
    try {
      await submitFeedback({
        source: "popup",
        rating,
        potluckId: potluckIds[0],
        promptedIds: potluckIds,
        ...(withDetails ? { reasons, comment } : {}),
      });
      toast("Thanks for the feedback!");
      onDone();
    } catch (err) {
      setError(friendlyError(err));
      setBusy("");
    }
  };

  return (
    <Dialog visible onClose={notNow} title={rating ? undefined : "How was your experience with Potluck Showdown?"}>
      <Stack gap={12}>
        {rating ? (
          <View style={{ alignSelf: "flex-start" }}>
            <Chip tone="green" icon="checkmark">{`Your rating: ${rating} / 5`}</Chip>
          </View>
        ) : (
          <Text style={[type.body, type.muted]}>A quick rating helps us make your next potluck even better.</Text>
        )}
        <View>
          <StarRating label="Rate your experience" value={rating} onChange={setRating} />
          <Row justify="space-between" style={{ marginTop: 4 }}>
            <Text style={[type.small, type.muted]}>1 · Poor</Text>
            <Text style={[type.small, type.muted]}>5 · Excellent</Text>
          </Row>
        </View>

        {!rating ? (
          <>
            <Text style={[type.small, type.muted, { textAlign: "center" }]}>Tap a star to rate your experience.</Text>
            <Button variant="link" title="Not now" onPress={notNow} />
          </>
        ) : (
          <>
            <Text style={type.h3}>Want to tell us why?</Text>
            <View>
              <Label>What shaped your rating?</Label>
              <ChipToggleGroup options={RATING_REASONS} value={reasons} onChange={setReasons} warn />
            </View>
            <View>
              <Label>Anything else?</Label>
              <Input multiline rows={3} maxLength={2000} value={comment} onChangeText={setComment}
                placeholder="Tell us what worked or what didn’t" accessibilityLabel="Anything else" />
            </View>
            {error ? <Banner>{error}</Banner> : null}
            <Button size="lg" title="Send feedback" icon="send-outline" loading={busy === "send"} disabled={Boolean(busy)} onPress={() => send(true)} />
            <Button variant="outline" title="Submit rating without comment" loading={busy === "plain"} disabled={Boolean(busy)} onPress={() => send(false)} />
          </>
        )}
      </Stack>
    </Dialog>
  );
}
