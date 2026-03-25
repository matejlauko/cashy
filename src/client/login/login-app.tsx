import { useState } from "react";
import { authClient } from "@/client/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function LoginApp() {
  const [isLoading, setIsLoading] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  const error = new URLSearchParams(window.location.search).get("error");
  const accessDenied = error === "access_denied";

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setSignInError(null);

    try {
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
        errorCallbackURL: "/login?error=access_denied",
      });

      if (error) {
        setSignInError("Sign in failed. Please try again.");
        setIsLoading(false);
      }
    } catch {
      setSignInError("Sign in failed. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Cashy</CardTitle>
          <CardDescription>Sign in to continue</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {accessDenied && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              Access denied. Your account is not authorized.
            </div>
          )}
          {signInError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {signInError}
            </div>
          )}
          <Button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? "Redirecting..." : "Sign in with Google"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
