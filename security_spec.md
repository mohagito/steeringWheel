# Security Specification: EPP Industrial Inventory & Scrap Management Platform

## 1. System Invariants & Business Constraints
1. **Traceability Guarantee**: Every Scrap record MUST include a valid part reference, date, positive quantity, condition ('CON COLA' or 'SIN COLA'), and supervisor name. Optional `invoiceNumber` must be a non-empty string when supplied.
2. **Stock Consistency Invariant**: Stock values across Stock 1 (Warehouse Raw Material), Stock 2 (WIP Pegadas), and Stock 3 (Finished Steering Wheels) must be non-negative integers.
3. **Audit Trail Integrity**: Transaction logs and scrap entries are append-only audit records.
4. **ID Poisoning Protection**: All document IDs across collections MUST pass string format validation (`^[a-zA-Z0-9_\\-]+$`) with a maximum length of 128 characters.
5. **Payload Size Guardrails**: String fields are constrained to reasonable lengths to prevent Denial-of-Wallet and payload injection attacks.

## 2. Dirty Dozen Security Attack Vectors & Test Cases
1. **Unbounded ID Injection Attack**: Sending a 2KB junk character string as `boxId`.
2. **Negative Quantity Injection**: Attempting to register a delivery, production, or scrap with negative or zero `quantity`.
3. **Ghost Field Shadow Update**: Injecting unauthorized fields (e.g. `isAdmin: true` or `shadowField: "hacked"`) into `references` or `boxes`.
4. **Invalid Condition Enum Injection**: Setting `condition` on scrap to `INVALID_STATE` instead of `'CON COLA'` or `'SIN COLA'`.
5. **Privilege Escalation in User Collection**: Attempting to update user `role` to `admin` without passing schema validation.
6. **Corrupted Stock Value Injection**: Writing a negative number or string into `currentStock` or `stock1`.
7. **Malformed Timestamp Attack**: Passing non-string or 100KB string payload into `timestamp`.
8. **Unregistered Collection Access**: Attempting to write to arbitrary unapproved path `/secrets/admin_passwords`.
9. **Missing Required Fields Attack**: Creating a `Delivery` without an `invoiceNumber` or `customer`.
10. **Scrap Invoice Over-length Attack**: Injecting a 10KB string into `scrap.invoiceNumber`.
11. **Type Confusion Attack**: Supplying a boolean or array where a number field is expected.
12. **Malformed Reference Code Injection**: Creating a box or reference with empty or white-space string.

## 3. Validation Blueprint Summary
All collections are guarded by `isValid[Entity]` validation functions that enforce:
- Exact key presence and required types.
- Upper boundary bounds on string lengths (`.size() <= MAX`).
- Integer bounds on numerical values (`>= 0` or `> 0`).
- Valid enum values for status and category types.
