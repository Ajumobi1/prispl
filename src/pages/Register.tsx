import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { registerAccount } from "@/lib/authApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ondoLogo from "@/assets/ondo-state-logo.png";
import odchcLogo from "@/assets/odchc-logo.png";

const SECURITY_QUESTIONS = [
  "What is your mother's maiden name?",
  "What was the name of your first pet?",
  "What city were you born in?",
  "What is the name of your favorite teacher?",
  "What is your favorite childhood movie?",
];

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("Planning");
  const [securityQuestion, setSecurityQuestion] = useState(SECURITY_QUESTIONS[0]);
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (password !== confirmPassword) {
      setError("Password confirmation does not match.");
      return;
    }

    if (!securityAnswer.trim()) {
      setError("Security answer is required.");
      return;
    }

    try {
      setIsSubmitting(true);
      const detail = await registerAccount({
        fullName, username, email, department, password,
        securityQuestion, securityAnswer: securityAnswer.trim(),
      });
      setMessage(detail);
      setFullName("");
      setUsername("");
      setEmail("");
      setDepartment("Planning");
      setSecurityQuestion(SECURITY_QUESTIONS[0]);
      setSecurityAnswer("");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      const text = err instanceof Error ? err.message : "Unable to create account.";
      setError(text);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center gap-4 mb-3">
            <img src={ondoLogo} alt="Ondo State Logo" className="h-14 w-14 object-contain" />
            <img src={odchcLogo} alt="ODCHC Logo" className="h-12 object-contain" />
          </div>
          <CardTitle className="text-2xl font-bold">Create Account</CardTitle>
          <CardDescription>New accounts require admin approval before login is allowed.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-3">
            <Input placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="h-10" />
            <Input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required className="h-10" />
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-10" />
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Planning">Planning</SelectItem>
                <SelectItem value="Research">Research</SelectItem>
                <SelectItem value="Statistics">Statistics</SelectItem>
                <SelectItem value="M&E">M&E</SelectItem>
                <SelectItem value="Administration">Administration</SelectItem>
              </SelectContent>
            </Select>
            <Select value={securityQuestion} onValueChange={setSecurityQuestion}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Security Question" />
              </SelectTrigger>
              <SelectContent>
                {SECURITY_QUESTIONS.map((q) => (
                  <SelectItem key={q} value={q}>{q}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Security Answer" value={securityAnswer} onChange={(e) => setSecurityAnswer(e.target.value)} required className="h-10" />
            <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-10" />
            <Input type="password" placeholder="Confirm Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="h-10" />
            {error && <p className="text-sm text-destructive">{error}</p>}
            {message && <p className="text-sm text-accent">{message}</p>}
            <Button type="submit" className="w-full h-11 font-semibold" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit For Approval"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            <Link to="/login" className="text-primary hover:text-primary/80 font-medium transition-colors">Back to Login</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
