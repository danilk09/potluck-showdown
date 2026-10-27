import React from "react";
import { Screen } from "./ui";

interface AuthShellProps {
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** Layout for the signed-out screens (welcome, sign in, sign up, reset). */
export default function AuthShell({ children, footer }: AuthShellProps) {
  return (
    <Screen footer={footer} contentStyle={{ maxWidth: 460, paddingTop: 16 }}>
      {children}
    </Screen>
  );
}
