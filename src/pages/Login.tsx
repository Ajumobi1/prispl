import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { loginSession } from "@/lib/authApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import SEO from "@/components/SEO";
import ondoLogo from "@/assets/ondo-state-logo.png";
import odchcLogo from "@/assets/odchc-logo.png";

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = searchParams.get("next") || "/task-tracker";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const session = await loginSession(username, password);
      if (session.role === "admin") {
        navigate(nextPath === "/login" ? "/account-admin" : nextPath, { replace: true });
      } else {
        navigate(nextPath.startsWith("/account-admin") ? "/task-tracker" : nextPath, { replace: true });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <SEO title="Sign in" description="Sign in to the PR&S Unit Platform." canonicalPath="/login" />
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary relative flex-col items-center justify-center p-12 text-primary-foreground overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, hsl(39 95% 55% / 0.3) 0%, transparent 50%), radial-gradient(circle at 80% 20%, hsl(160 45% 40% / 0.2) 0%, transparent 40%)" }} />
        <div className="relative z-10 flex flex-col items-center gap-8 text-center">
          <div className="flex items-center gap-6">
            <img src={ondoLogo} alt="Ondo State Logo" className="h-24 w-24 object-contain" />
            <img src={odchcLogo} alt="ODCHC Logo" className="h-20 object-contain" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">PR&S Unit Platform</h1>
            <p className="mt-3 text-lg text-primary-foreground/80">Planning, Research & Statistics Unit</p>
            <p className="mt-1 text-sm text-primary-foreground/60">Ondo State Contributory Health Commission</p>
          </div>
          <div className="mt-8 grid grid-cols-3 gap-6 text-center">
            <div className="rounded-xl bg-primary-foreground/10 backdrop-blur-sm p-4">
              <p className="text-2xl font-bold">Task</p>
              <p className="text-xs text-primary-foreground/70 mt-1">Tracking</p>
            </div>
            <div className="rounded-xl bg-primary-foreground/10 backdrop-blur-sm p-4">
              <p className="text-2xl font-bold">Team</p>
              <p className="text-xs text-primary-foreground/70 mt-1">Management</p>
            </div>
            <div className="rounded-xl bg-primary-foreground/10 backdrop-blur-sm p-4">
              <p className="text-2xl font-bold">Data</p>
              <p className="text-xs text-primary-foreground/70 mt-1">Analytics</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel - login form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md shadow-xl border-0 bg-card">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center gap-4 mb-4 lg:hidden">
              <img src={ondoLogo} alt="Ondo State Logo" className="h-16 w-16 object-contain" />
              <img src={odchcLogo} alt="ODCHC Logo" className="h-14 object-contain" />
            </div>
            <CardTitle className="text-2xl font-bold text-foreground">Welcome Back</CardTitle>
            <CardDescription>Sign in to continue to the platform.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Username</label>
                <Input
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Password</label>
                <Input
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full h-11 text-base font-semibold" disabled={isSubmitting}>
                {isSubmitting ? "Signing in..." : "Sign In"}
              </Button>
            </form>
            <div className="mt-6 flex flex-col items-center gap-2 text-sm">
              <Link to="/forgot-password" className="text-primary hover:text-primary/80 font-medium transition-colors">Forgot Password?</Link>
              <Link to="/register" className="text-primary hover:text-primary/80 font-medium transition-colors">Create New Account</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
