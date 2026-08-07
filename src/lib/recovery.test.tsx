import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/integrations/supabase/client", async () => {
  const { backend } = await import("@/test/mocks/backend");
  return { supabase: backend.client };
});

import { backend } from "@/test/mocks/backend";
import ForgotPasswordPage from "@/pages/ForgotPassword";

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );
}

async function lookup(user: ReturnType<typeof userEvent.setup>, username = "  JANE  ") {
  await user.type(screen.getByPlaceholderText("Username"), username);
  await user.click(screen.getByRole("button", { name: /find account/i }));
}

beforeEach(() => {
  backend.reset();
});

describe("security question lookup (get-security-question)", () => {
  it("sends the normalised username and reveals only the question", async () => {
    const user = userEvent.setup();
    backend.functions.invoke.mockResolvedValue({
      data: { security_question: "First pet?" },
      error: null,
    } as never);

    renderPage();
    await lookup(user);

    expect(backend.functions.invoke).toHaveBeenCalledWith("get-security-question", {
      body: { username: "jane" },
    });
    expect(await screen.findByText("First pet?")).toBeInTheDocument();
  });

  it("shows one generic failure for unknown accounts — no enumeration", async () => {
    const user = userEvent.setup();
    backend.functions.invoke.mockResolvedValue({
      data: { error: "Unable to look up account." },
      error: null,
    } as never);

    renderPage();
    await lookup(user, "ghost");

    expect(await screen.findByText("Unable to look up account.")).toBeInTheDocument();
    // Stays on the lookup step — no question, no answer form.
    expect(screen.queryByPlaceholderText("Your Answer")).not.toBeInTheDocument();
  });

  it("does not retry when the lookup is rate limited", async () => {
    const user = userEvent.setup();
    backend.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: "Too many attempts. Try again in 42s." },
    } as never);

    renderPage();
    await lookup(user);

    expect(await screen.findByText("Unable to look up account.")).toBeInTheDocument();
    expect(backend.functions.invoke).toHaveBeenCalledTimes(1);
  });
});

describe("self-service password reset (reset-password-self)", () => {
  async function reachAnswerStep(user: ReturnType<typeof userEvent.setup>) {
    backend.functions.invoke.mockResolvedValue({
      data: { security_question: "First pet?" },
      error: null,
    } as never);
    renderPage();
    await lookup(user);
    await screen.findByText("First pet?");
    backend.functions.invoke.mockClear();
  }

  async function fillReset(
    user: ReturnType<typeof userEvent.setup>,
    password: string,
    confirm = password,
  ) {
    await user.type(screen.getByPlaceholderText("Your Answer"), "rex");
    await user.type(screen.getByPlaceholderText("New Password"), password);
    await user.type(screen.getByPlaceholderText("Confirm New Password"), confirm);
    await user.click(screen.getByRole("button", { name: /reset password/i }));
  }

  it("sends the normalised username, answer and new password", async () => {
    const user = userEvent.setup();
    await reachAnswerStep(user);
    backend.functions.invoke.mockResolvedValue({ data: { success: true }, error: null } as never);

    await fillReset(user, "newsecret123");

    await waitFor(() =>
      expect(backend.functions.invoke).toHaveBeenCalledWith("reset-password-self", {
        body: { username: "jane", securityAnswer: "rex", newPassword: "newsecret123" },
      }),
    );
  });

  it("blocks a short password before any network call", async () => {
    const user = userEvent.setup();
    await reachAnswerStep(user);

    await fillReset(user, "short1");

    expect(await screen.findByText("Password must be at least 8 characters.")).toBeInTheDocument();
    expect(backend.functions.invoke).not.toHaveBeenCalled();
  });

  it("blocks mismatched confirmation before any network call", async () => {
    const user = userEvent.setup();
    await reachAnswerStep(user);

    await fillReset(user, "newsecret123", "othersecret123");

    expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument();
    expect(backend.functions.invoke).not.toHaveBeenCalled();
  });

  it("shows the same generic message for a wrong answer as for an unknown user", async () => {
    const user = userEvent.setup();
    await reachAnswerStep(user);
    backend.functions.invoke.mockResolvedValue({
      data: { error: "Username or security answer is incorrect." },
      error: null,
    } as never);

    await fillReset(user, "newsecret123");

    expect(
      await screen.findByText("Username or security answer is incorrect."),
    ).toBeInTheDocument();
  });

  it("stops after one attempt when the reset is rate limited", async () => {
    const user = userEvent.setup();
    await reachAnswerStep(user);
    backend.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: "Too many attempts. Try again in 42s." },
    } as never);

    await fillReset(user, "newsecret123");

    expect(await screen.findByText("Password reset failed.")).toBeInTheDocument();
    expect(backend.functions.invoke).toHaveBeenCalledTimes(1);
  });
});
