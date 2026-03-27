import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"lookup" | "answer" | "done">("lookup");
  const [username, setUsername] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookupQuestion = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const normalizedUsername = username.trim().toLowerCase();
      // We need to look up the security question. Since unauthenticated users can't query profiles,
      // we'll use the edge function which handles this server-side.
      const { data, error: fnError } = await supabase.functions.invoke("get-security-question", {
        body: { username: normalizedUsername },
      });
      if (fnError) throw new Error("Unable to look up account.");
      if (data?.error) throw new Error(data.error);
      if (!data?.security_question) throw new Error("No security question set. Contact an admin.");
      setSecurityQuestion(data.security_question);
      setStep("answer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }
    setIsSubmitting(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("reset-password-self", {
        body: { username: username.trim().toLowerCase(), securityAnswer, newPassword },
      });
      if (fnError) throw new Error("Password reset failed.");
      if (data?.error) throw new Error(data.error);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Reset Password</CardTitle>
          <CardDescription>Answer your security question to reset your password.</CardDescription>
        </CardHeader>
        <CardContent>
          {step === "lookup" && (
            <form onSubmit={lookupQuestion} className="space-y-4">
              <Input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Looking up..." : "Find Account"}
              </Button>
            </form>
          )}
          {step === "answer" && (
            <form onSubmit={resetPassword} className="space-y-4">
              <p className="text-sm font-medium text-foreground">Security Question:</p>
              <p className="text-sm text-muted-foreground">{securityQuestion}</p>
              <Input placeholder="Your Answer" value={securityAnswer} onChange={(e) => setSecurityAnswer(e.target.value)} required />
              <Input type="password" placeholder="New Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
              <Input type="password" placeholder="Confirm New Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Resetting..." : "Reset Password"}
              </Button>
            </form>
          )}
          {step === "done" && (
            <div className="space-y-4 text-center">
              <p className="text-sm text-emerald-600">Password has been reset successfully!</p>
              <Button asChild className="w-full"><Link to="/login">Back to Login</Link></Button>
            </div>
          )}
          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
          <div className="mt-4 text-center text-sm">
            <Link to="/login" className="text-primary underline">Back to Login</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
