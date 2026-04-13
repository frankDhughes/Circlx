"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function AuthPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");

  const [isLogin, setIsLogin] = useState(true);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem("circlx-guide-seen");
    if (!seen) {
      setShowGuide(true);
      localStorage.setItem("circlx-guide-seen", "true");
    }
  }, []);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleForgotPassword() {
    if (!email.trim()) { setError("Please enter your email address."); return; }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/reset`,
      });
      if (error) throw error;
      setMessage("Check your email for a password reset link.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send reset email.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAuth() {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        router.push("/profile");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;

        if (!data.user) {
          throw new Error("User was not created.");
        }

        // If no session, email confirmation is required
        if (!data.session) {
          setMessage("Account created. Check your email to confirm your account, then sign in.");
          return;
        }

        const cleanUsername = username.trim() || email.split("@")[0].slice(0, 30);

        // Create an authenticated client using the new session token directly
        // so the Authorization header is guaranteed to be present on the upsert
        const { createClient } = await import("@supabase/supabase-js");
        const authedClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            global: {
              headers: {
                Authorization: `Bearer ${data.session.access_token}`,
              },
            },
          }
        );

        const { error: profileError } = await authedClient
          .from("profiles")
          .upsert(
            { id: data.user.id, username: cleanUsername },
            { onConflict: "id", ignoreDuplicates: false }
          );

        if (profileError) {
          if (profileError.code === "23505" || profileError.message?.includes("duplicate") || profileError.message?.includes("unique")) {
            setError("That username is already taken! Please choose another.");
            setLoading(false);
            return;
          }
          throw profileError;
        }

        // Retry fetching the profile up to 5 times with 500ms gaps —
        // the row may need a moment to be readable due to replication lag
        let profileReady = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          const { data: check } = await supabase
            .from("profiles")
            .select("id")
            .eq("id", data.user.id)
            .maybeSingle();
          if (check) { profileReady = true; break; }
          await new Promise((r) => setTimeout(r, 500));
        }

        if (!profileReady) throw new Error("Profile setup took too long. Please try signing in.");

        router.push("/profile");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md rounded-3xl border-0 shadow-sm">
        <CardHeader>
          <div className="flex justify-center mb-2">
            <img src="/circlxlogosmall.svg" alt="Circlx" className="h-15 w-15 block dark:hidden" />
            <img src="/circlxlogodarksmall.svg" alt="Circlx" className="h-15 w-15 hidden dark:block" />
          </div>
          <CardTitle className="text-center text-2xl">
            {isForgotPassword ? "Reset Password" : isLogin ? "Sign In" : "Create Account"}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {isForgotPassword ? (
            <>
              <p className="text-sm text-slate-500 text-center">
                Enter your email and we'll send you a reset link.
              </p>
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleForgotPassword(); }}
              />
              {error && <div className="text-sm text-red-500">{error}</div>}
              {message && <div className="text-sm text-green-600">{message}</div>}
              <Button onClick={handleForgotPassword} disabled={loading} className="w-full rounded-2xl">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send reset link
              </Button>
              <Button variant="ghost" onClick={() => { setIsForgotPassword(false); setError(null); setMessage(null); }} className="w-full">
                Back to sign in
              </Button>
            </>
          ) : (
            <>
              {!isLogin && (
                <Input
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              )}
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAuth(); }}
              />
              {error && <div className="text-sm text-red-500">{error}</div>}
              {message && <div className="text-sm text-green-600">{message}</div>}
              <Button onClick={handleAuth} disabled={loading} className="w-full rounded-2xl">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLogin ? "Sign In" : "Sign Up"}
              </Button>
              {isLogin && (
                <Button variant="ghost" onClick={() => { setIsForgotPassword(true); setError(null); setMessage(null); }} className="w-full text-slate-500 text-sm">
                  Forgot password?
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => { setIsLogin(!isLogin); setError(null); setMessage(null); }}
                className="w-full"
              >
                {isLogin ? "Need an account? Sign up" : "Already have an account? Sign in"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
    {/* First-time visitor guide — slides in from right */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-white dark:bg-slate-900 shadow-2xl transition-transform duration-500 ease-in-out ${showGuide ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 px-5 py-4 shrink-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Getting Started with Circlx</h2>
          <button
            type="button"
            onClick={() => setShowGuide(false)}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 text-sm text-slate-700 dark:text-slate-300">
          <div>
            <p className="font-semibold text-slate-900 dark:text-white mb-1">Creating your account</p>
            <p>Sign up with your email, a username, and a password. Your username is how others find and mention you across the app. If you ever forget your password, use the "Forgot password?" link on the sign in page to get a reset email.</p>
          </div>

          <div>
            <p className="font-semibold text-slate-900 dark:text-white mb-1">Your profile</p>
            <p>After signing in you land on your profile page. From here you can update your username, bio, and profile picture. Your bio can be up to 80 characters. Click your avatar to upload a new one.</p>
          </div>

          <div>
            <p className="font-semibold text-slate-900 dark:text-white mb-1">Circles (Boards)</p>
            <p>Circles are group discussion spaces. Click <span className="font-medium">+ Circle</span> to create one — give it a title (up to 30 characters), a description (up to 150), and choose Public or Private. Public circles are visible to everyone. Private circles are invite-only.</p>
            <p className="mt-2">To join a public circle, find it in the public boards list and click <span className="font-medium">Join</span>. To leave, open the circle and click <span className="font-medium">Leave</span>.</p>
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-100 dark:border-slate-700 px-5 py-4">
          <button
            type="button"
            onClick={() => setShowGuide(false)}
            className="w-full rounded-2xl bg-slate-900 dark:bg-white py-2.5 text-sm font-medium text-white dark:text-slate-900 transition hover:bg-slate-700 dark:hover:bg-slate-100"
          >
            Got it
          </button>
        </div>
      </div>

      {/* Backdrop */}
      {showGuide && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setShowGuide(false)}
        />
      )}
    </>
  );
}