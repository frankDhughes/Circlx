"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Supabase sends the user here with a hash fragment containing the session.
  // onAuthStateChange picks up the RECOVERY event and establishes the session.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleReset() {
    setError(null);
    if (!password) { setError("Please enter a new password."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMessage("Password updated! Redirecting...");
      setTimeout(() => router.push("/profile"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md rounded-3xl border-0 shadow-sm">
        <CardHeader>
          <div className="flex justify-center mb-2">
            <img src="/circlxlogosmall.svg" alt="Circlx" className="h-15 w-15 block dark:hidden" />
            <img src="/circlxlogodarksmall.svg" alt="Circlx" className="h-15 w-15 hidden dark:block" />
          </div>
          <CardTitle className="text-center text-2xl">Set New Password</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {!ready ? (
            <div className="flex flex-col items-center gap-3 py-6 text-sm text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin" />
              Verifying reset link...
            </div>
          ) : message ? (
            <div className="py-4 text-center text-sm text-green-600">{message}</div>
          ) : (
            <>
              <Input
                type="password"
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleReset(); }}
              />
              <Input
                type="password"
                placeholder="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleReset(); }}
              />
              {error && <div className="text-sm text-red-500">{error}</div>}
              <Button onClick={handleReset} disabled={loading} className="w-full rounded-2xl">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update password
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}