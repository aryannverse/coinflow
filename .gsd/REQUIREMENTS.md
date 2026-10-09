# REQUIREMENTS.md — ClarifyFinance System Requirements

> **Status**: `BASELINE`
> **Specification**: [.gsd/SPEC.md](./SPEC.md)

---

## Requirements Traceability Matrix

| ID | Requirement | Category | Source | Status |
|:---|:---|:---|:---|:---|
| **REQ-01** | **User Authentication & Profiles**: Secure registration, login, session management, user avatars, and payment handles (UPI / Venmo / PayPal). | Security & Auth | SPEC Goal 7 | Pending |
| **REQ-02** | **Group & Event Spaces**: Create and manage shared spaces (events, trips, households) with multi-member rosters and aggregated balances. | Core Domain | SPEC Goal 1, 2 | Pending |
| **REQ-03** | **Multimodal Audio Capture HUD**: Web Audio API waveform recording, speech transcription, and natural language staging chips for voice logging. | HCI & Ingestion | SPEC Goal 1, SRS 3.1 | Pending |
| **REQ-04** | **Receipt OCR & Item Extraction**: Image upload and automated parsing into line items with item name, quantity, and unit price. | Ingestion & AI | SPEC Goal 1, SRS 3.2 | Pending |
| **REQ-05** | **Interactive Itemization Canvas**: Direct-manipulation UI for assigning members to items, custom shares, and proportional auto-allocation of tax and tips. | HCI & Splitting | SPEC Goal 2, HLD 4.1 | Pending |
| **REQ-06** | **Greedy Min-Cash-Flow Simplification**: Algorithmic reduction of group debts into minimal transactions while strictly preserving net balance invariance. | Financial Engine | SPEC Goal 3, HLD 4.2 | Pending |
| **REQ-07** | **Explainable Debt Topology Graph**: Interactive directed node graph of members and payment flows, with provenance modals explaining transitive settlement paths. | Visualization | SPEC Goal 3, SRS 3.3 | Pending |
| **REQ-08** | **Payment Links & Settlement Tracking**: Direct UPI / payment link generation, receipt share cards, and one-click debt mark-as-settled reconciliation. | Core Domain | SPEC Goal 3, SRS 3.5 | Pending |
| **REQ-09** | **Forward-Looking "Safe-to-Spend" Metric**: Dynamic calculation of discretionary headroom combining checking balance, upcoming bills, and pending receivables. | Personal Finance | SPEC Goal 4, HLD 4.3 | Pending |
| **REQ-10** | **Autonomous Agentic Co-Pilot**: LangGraph / LangChain tool-calling agent answering financial queries (*"Can I afford dinner?"*), logging expenses, and explaining splits. | Agentic AI | SPEC Goal 5, HLD 2.3 | Pending |
| **REQ-11** | **Kinetic Design & Micro-Animations**: Lenis smooth scrolling, GSAP animations, React Bits & Magic UI interactive components (animated beams, bento grids, glassmorphism). | UI / UX | SPEC Goal 6 | Pending |
| **REQ-12** | **HCI Guardrails & Accessibility**: 10-second non-destructive Undo window, minimum 48x48px touch affordances, WCAG 2.1 AA 4.5:1 contrast, and <100ms feedback indicators. | Usability & a11y | SPEC Goal 6, SRS 4.1 | Pending |
