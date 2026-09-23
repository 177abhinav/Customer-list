import passport from "passport";
import xsenv from "@sap/xsenv";
import { JWTStrategy } from "@sap/xssec";

/**
 * Validates the JWT that App Router attaches to every proxied request once
 * XSUAA is in the picture. Locally (no VCAP_SERVICES / no xsuaa binding,
 * since there's no App Router or login flow running on a laptop), this is
 * a no-op that lets every request through -- same "deployed vs local"
 * pattern as destinationService.js, for the same reason: npm run dev
 * shouldn't require standing up the whole BTP auth chain just to iterate
 * on business logic.
 */

// Cached once at startup so both configureAuth and requireScope can use it
// -- specifically its xsappname, needed to build fully-qualified scope
// names (see requireScope below).
let cachedXsuaaCredentials = null;

export function configureAuth(app) {
  try {
    cachedXsuaaCredentials = xsenv.getServices({ uaa: { tag: "xsuaa" } }).uaa;
  } catch {
    console.warn(
      "No XSUAA service binding found -- running WITHOUT authentication. " +
      "Expected locally; if this is deployed, check the xsuaa binding."
    );
    return;
  }

  // @sap/xssec's JWTStrategy validates the token's signature against
  // XSUAA's public key and checks it was issued for this app -- it does
  // NOT check scopes itself, that's handled separately below.
  // (API shown here is for @sap/xssec v3.x -- if your installed version
  // differs, check that package's own docs for the current constructor
  // shape before assuming this matches exactly.)
  passport.use(new JWTStrategy(cachedXsuaaCredentials));
  app.use(passport.initialize());
  app.use(passport.authenticate("JWT", { session: false }));

  console.log("XSUAA authentication enabled.");
}

/**
 * Route-level scope check. App Router's xs-app.json already restricts
 * /api/* to callers holding the Display scope before a request even
 * reaches this app -- this is a defense-in-depth second check, in case
 * this API is ever reached by a path other than through App Router.
 *
 * IMPORTANT: xssec's checkScope() needs the FULLY QUALIFIED scope name
 * (xsappname.ScopeName, e.g. "customer-list-app-dev!t695824.Display"),
 * matching exactly what's embedded in the JWT -- not the bare scope name
 * from xs-security.json's "$XSAPPNAME.Display" template. xs-app.json gets
 * this right automatically (App Router substitutes $XSAPPNAME itself);
 * this middleware has to build that qualified name manually.
 */
export function requireScope(shortScopeName) {
  return (req, res, next) => {
    const securityContext = req.authInfo || req.user;
    if (!securityContext) {
      // No XSUAA binding (local dev) -- nothing to check against.
      return next();
    }

    const fullScopeName = cachedXsuaaCredentials
      ? `${cachedXsuaaCredentials.xsappname}.${shortScopeName}`
      : shortScopeName;

    if (typeof securityContext.checkScope === "function" && !securityContext.checkScope(fullScopeName)) {
      return res.status(403).json({ message: "Missing required scope", status: 403 });
    }
    next();
  };
}