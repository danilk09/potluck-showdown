import React from "react";
import { useLocalSearchParams } from "expo-router";
import JoinScreen from "../../components/JoinScreen";

/** Invite links: potluckshowdown://join/CODE or https://<web>/join/CODE */
export default function JoinWithCode() {
  const { code } = useLocalSearchParams<{ code: string }>();
  // Keyed so opening a second invite link remounts with the new code.
  return <JoinScreen key={code} codeParam={code} />;
}
