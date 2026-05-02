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

    // Public routes — no auth check needed
    if (pathname === "/login") {
      if (user) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
      return NextResponse.next({ request });
    }

    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    if (pathname === "/") {
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
