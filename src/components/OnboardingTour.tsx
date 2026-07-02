import { useEffect, useState } from "react";
import { HelpCircle, ChevronLeft, ChevronRight, LayoutDashboard, Download, ShieldCheck, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STORAGE_KEY = "prs_onboarding_v1_done";

type Step = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: React.ReactNode;
};

const STEPS: Step[] = [
  {
    icon: LayoutDashboard,
    title: "Welcome to the PR&S Dashboard",
    body: (
      <p>
        This dashboard gives leadership a monthly view of tasks across Planning, Research,
        Statistics and M&amp;E. Use the <span className="font-medium">Month</span> selector at the
        top to switch reporting periods — totals, department snapshots and analytics all follow it.
      </p>
    ),
  },
  {
    icon: ListChecks,
    title: "Read the numbers at a glance",
    body: (
      <p>
        The status cards summarise task counts (Total, Not Started, In Progress, Awaiting Review,
        Completed, Delayed). Below them, the <span className="font-medium">Department Snapshot</span> and
        <span className="font-medium"> Task Overview</span> tables break the same data down by unit
        and by individual task.
      </p>
    ),
  },
  {
    icon: Download,
    title: "Analytics &amp; Exports",
    body: (
      <div className="space-y-2">
        <p>
          The <span className="font-medium">Task Analytics</span> card lets you switch between
          bar, donut and pivot views. Use the export buttons to download the current view.
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          <li><span className="font-medium text-foreground">CSV / Excel:</span> a preview modal shows the exact rows before download.</li>
          <li>Exports respect the selected month and chart type.</li>
          <li>Pivot data is included alongside the chart when relevant.</li>
        </ul>
      </div>
    ),
  },
  {
    icon: ShieldCheck,
    title: "Security &amp; account safety",
    body: (
      <div className="space-y-2">
        <p>
          Your account is protected by admin approval, leaked-password checks and a security
          question for self-service recovery.
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          <li>Set or update your security answer from <span className="font-medium text-foreground">Profile</span>.</li>
          <li>Forgot your password? Use <span className="font-medium text-foreground">Forgot Password</span> on the login screen.</li>
          <li>New sign-ups stay locked out until an admin approves them.</li>
        </ul>
      </div>
    ),
  },
];

export default function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setOpen(true);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const finish = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setOpen(false);
    setStep(0);
  };

  const start = () => {
    setStep(0);
    setOpen(true);
  };

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={start}
        className="text-primary-foreground hover:bg-primary-foreground/10"
        aria-label="Show onboarding tour"
      >
        <HelpCircle className="h-4 w-4 sm:mr-1" />
        <span className="hidden sm:inline">Tour</span>
      </Button>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : finish())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle>{current.title}</DialogTitle>
                <DialogDescription>
                  Step {step + 1} of {STEPS.length}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="py-2 text-sm text-foreground">{current.body}</div>

          <div className="flex items-center justify-center gap-1.5 pt-2">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>

          <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={finish}>
              Skip
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              {isLast ? (
                <Button size="sm" onClick={finish}>
                  Got it
                </Button>
              ) : (
                <Button size="sm" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
