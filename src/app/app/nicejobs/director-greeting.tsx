"use client";

import { useEffect, useState } from "react";

function localGreeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening";
}

export function DirectorGreeting() {
  const [greeting, setGreeting] = useState("Good Morning");
  useEffect(() => {
    const update = () => setGreeting(localGreeting());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return <h1>{greeting}, <span>Director!</span></h1>;
}
