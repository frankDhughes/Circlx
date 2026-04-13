"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function SplashPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    async function getDestination() {
      const { data } = await supabase.auth.getSession();
      return data.session ? "/profile" : "/auth";
    }

    video.play().catch(async () => {
      router.push(await getDestination());
    });

    const handleEnded = async () => {
      router.push(await getDestination());
    };

    video.addEventListener("ended", handleEnded);
    return () => video.removeEventListener("ended", handleEnded);
  }, [router]);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <video
        ref={videoRef}
        src="/CirclxSplash.mp4"
        className="h-full w-full object-cover"
        autoPlay
        muted
        playsInline
        preload="auto"
      />
    </div>
  );
}