import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // If credentials missing, treat as unauthenticated
    if (!url || !key) {
      if (pathname === "/login" || pathname === "/") {
        return NextResponse.next({ request });
      }
      return NextResponse.redirect(new URL("/login", request.url));
    }

    let supabaseResponse = NextResponse.next({ request });

    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    });

    let user = null;
    try {
      const { data } = await supabase.auth.getUser();
      user = data.user;
    } catch {
      // Supabase unreachable — treat as unauthenticated
    }

    const RECIPE_HIDDEN_UID = "0a6cfba1-0ac2-4792-b306-e67ee912390b";

    // Public routes — no auth or version check needed
    if (pathname === "/login" || pathname === "/unauthorized") {
      if (user && pathname === "/login") {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
      return NextResponse.next({ request });
    }

    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // Version guard: only v1 users allowed
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("version")
      .eq("id", user.id)
      .single();
    if (!profile || profile.version !== "v1") {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/unauthorized", request.url));
    }

    if (pathname === "/") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    // Hide Recipes module for specific user — redirect to dashboard
    if (user.id === RECIPE_HIDDEN_UID && pathname.startsWith("/recipes")) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    return supabaseResponse;
  } catch {
    // Last-resort: never return 500 from middleware
    const { pathname } = request.nextUrl;
    if (pathname === "/login") return NextResponse.next({ request });
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons).*)",
  ],
};
