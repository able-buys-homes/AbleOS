// lib/qboLedger.js
// Putting the rent ledger into QuickBooks.
//
// The shape is deliberate: a customer per lot, an invoice per charge, and a
// payment applied against those invoices oldest first. That is what gives
// QuickBooks an accounts receivable it can age - who owes what, and for how
// long. A sales receipt would have been half the code and would never have been
// able to answer that question.
//
// The lot is the customer, not the tenant. Tenants move; the lot is what owes
// rent, and keeping the customer stable means a lot's history survives a
// change of occupant instead of scattering across several QuickBooks records.

import { createClient } from "@supabase/supabase-js";
import { qbo, qboQuery, qboEscape } from "./qbo.js";

let cachedClient = null;

function getClient() {
    if (cachedClient) return cachedClient;

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SECRET_KEY missing");

    cachedClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    return cachedClient;
}

/**
 * How our payment methods map onto QuickBooks'.
 *
 * This is a label, not an accounting entry - it does not move a penny - but it
 * is what tells whoever reconciles the bank where to expect the money. Card
 * payments arrive days later as a Stripe payout; cash arrives in a drawer. A
 * card booked as cash sends them looking for a deposit that never existed.
 *
 * po_box and other are deliberately absent. We genuinely do not know what came
 * in the envelope, and an invented label is worse than an empty field.
 */
const QBO_PAYMENT_METHOD = {
    portal: { name: "Credit Card", card: true },
    card: { name: "Credit Card", card: true },
    cash: { name: "Cash", card: false },
    money_order: { name: "Money Order", card: false },
    cashiers_check: { name: "Cashier's Check", card: false },
    bank: { name: "Bank Transfer", card: false },
};

// Payment methods barely change, so remembering them saves a query per payment
// on a warm instance. Scoped to the process, so a rename in QuickBooks is
// picked up on the next cold start rather than never.
const paymentMethodCache = new Map();

/**
 * The QuickBooks payment method with this name, created if it is missing.
 *
 * Looked up before creating: QuickBooks ships with Cash, Check and Credit Card
 * already, and duplicating them would clutter every dropdown in the books.
 */
async function ensurePaymentMethod(name, isCreditCard) {
    if (paymentMethodCache.has(name)) return paymentMethodCache.get(name);

    const found = await qboQuery(
        `select Id from PaymentMethod where Name = '${qboEscape(name)}'`,
    );

    let id = found?.PaymentMethod?.[0]?.Id ?? null;

    if (!id) {
        const created = await qbo("/paymentmethod", {
            method: "POST",
            body: {
                Name: name,
                Type: isCreditCard ? "CREDIT_CARD" : "NON_CREDIT_CARD",
            },
        });

        id = created?.PaymentMethod?.Id ?? null;
    }

    if (id) paymentMethodCache.set(name, id);
    return id;
}

function customerName(lot) {
    const property = String(lot.property ?? "").trim();
    return property ? `${property} - Lot ${lot.lot_number}` : `Lot ${lot.lot_number}`;
}

/**
 * The QuickBooks customer for a lot, created the first time it is needed.
 *
 * Looked up by name before creating, so a customer somebody made by hand is
 * adopted rather than duplicated - QuickBooks refuses duplicate display names
 * anyway, and a hard failure here would stop rent posting entirely.
 */
export async function ensureCustomer(lot) {
    if (lot.qbo_customer_id) return lot.qbo_customer_id;

    const name = customerName(lot);

    const found = await qboQuery(
        `select Id from Customer where DisplayName = '${qboEscape(name)}'`,
    );

    let id = found?.Customer?.[0]?.Id ?? null;

    if (!id) {
        const created = await qbo("/customer", {
            method: "POST",
            body: {
                DisplayName: name,
                CompanyName: String(lot.tenant_name ?? "").trim() || undefined,
                Notes: "Created by Able OS. One customer per lot.",
            },
        });

        id = created?.Customer?.Id ?? null;
    }

    if (!id) throw { status: 502, message: `Could not create a customer for ${name}` };

    const supabase = getClient();
    const { error } = await supabase
        .from("lots")
        .update({ qbo_customer_id: id })
        .eq("id", lot.id);

    if (error) throw new Error(error.message);

    return id;
}

/**
 * The service item every rent line points at.
 *
 * QuickBooks will not accept an invoice line without one, and it is what
 * decides which income account the money lands in. Found by name first so the
 * bookkeeper can repoint it later without this code arguing.
 */
export async function ensureRentItem(name = "Lot Rent") {
    const found = await qboQuery(`select Id from Item where Name = '${qboEscape(name)}'`);
    const existing = found?.Item?.[0]?.Id;
    if (existing) return existing;

    // Pick an income account rather than inventing one. A new account in
    // somebody's chart of accounts is not ours to create quietly.
    const accounts = await qboQuery(
        "select Id, Name from Account where AccountType = 'Income' maxresults 20",
    );

    const list = accounts?.Account ?? [];
    const preferred =
        list.find((a) => /rent/i.test(a.Name)) ?? list[0] ?? null;

    if (!preferred) {
        throw {
            status: 409,
            message:
                "QuickBooks has no income account, so rent has nowhere to post. Add one in the chart of accounts first.",
        };
    }

    const created = await qbo("/item", {
        method: "POST",
        body: {
            Name: name,
            Type: "Service",
            IncomeAccountRef: { value: preferred.Id },
        },
    });

    const id = created?.Item?.Id;
    if (!id) throw { status: 502, message: "Could not create the Lot Rent item" };

    return id;
}

/**
 * Posts one rent_ledger row as an invoice, and remembers the id.
 *
 * Returns the existing id untouched if the charge has already been posted, so
 * this is safe to call again on the whole ledger without doubling anyone's
 * balance.
 */
export async function postCharge(charge, lot, label = "Lot rent") {
    if (charge.qbo_txn_id) return charge.qbo_txn_id;

    const customerId = await ensureCustomer(lot);
    const itemId = await ensureRentItem();

    const amount = Number(charge.amount ?? 0);
    if (!(amount > 0)) return null;

    const created = await qbo("/invoice", {
        method: "POST",
        body: {
            CustomerRef: { value: customerId },
            TxnDate: charge.due_date ?? undefined,
            DueDate: charge.due_date ?? undefined,
            // Traceable back to the row that caused it, without anyone having
            // to match on amount and date.
            PrivateNote: `Able OS rent_ledger ${charge.id}`,
            Line: [
                {
                    DetailType: "SalesItemLineDetail",
                    Amount: amount,
                    Description: `${label} - ${charge.period ?? ""}`.trim(),
                    SalesItemLineDetail: {
                        ItemRef: { value: itemId },
                        Qty: 1,
                        UnitPrice: amount,
                    },
                },
            ],
        },
    });

    const id = created?.Invoice?.Id;
    if (!id) throw { status: 502, message: "QuickBooks did not return an invoice id" };

    const supabase = getClient();
    const { error } = await supabase
        .from("rent_ledger")
        .update({ qbo_txn_id: id })
        .eq("id", charge.id);

    if (error) throw new Error(error.message);

    return id;
}

/**
 * Posts one payment, applied against that lot's open invoices oldest first.
 *
 * If there is nothing open to apply it to, the payment still posts as an
 * unapplied credit on the customer. That is the honest answer - the money did
 * arrive - and it settles itself against the next invoice raised.
 */
export async function postPayment(payment, lot) {
    if (payment.qbo_payment_id) return payment.qbo_payment_id;

    const customerId = await ensureCustomer(lot);
    const amount = Number(payment.amount ?? 0);

    if (!(amount > 0)) return null;

    const open = await qboQuery(
        `select Id, Balance, TxnDate from Invoice where CustomerRef = '${qboEscape(
            customerId,
        )}' and Balance > '0' orderby TxnDate asc maxresults 20`,
    );

    let remaining = amount;
    const lines = [];

    for (const invoice of open?.Invoice ?? []) {
        if (remaining <= 0) break;

        const balance = Number(invoice.Balance ?? 0);
        if (!(balance > 0)) continue;

        const applied = Math.min(balance, remaining);
        remaining = Number((remaining - applied).toFixed(2));

        lines.push({
            Amount: applied,
            LinkedTxn: [{ TxnId: invoice.Id, TxnType: "Invoice" }],
        });
    }

        // How they paid, in QuickBooks' own vocabulary. Left unset when we do not
    // know, and never allowed to fail the payment - a missing label is a
    // nuisance, a payment that did not post is a dispute.
    const mapped = QBO_PAYMENT_METHOD[String(payment.method ?? "")] ?? null;
    let paymentMethodId = null;

    if (mapped) {
        try {
            paymentMethodId = await ensurePaymentMethod(mapped.name, mapped.card);
        } catch (err) {
            console.error("qbo: could not resolve payment method", err?.message ?? err);
        }
    }

    const created = await qbo("/payment", {
        method: "POST",
        body: {
            CustomerRef: { value: customerId },
            TotalAmt: amount,
            TxnDate: String(payment.received_at ?? "").slice(0, 10) || undefined,
            PrivateNote: `Able OS payment ${payment.id}${
                payment.receipt_number ? ` (${payment.receipt_number})` : ""
            }`,
            ...(paymentMethodId ? { PaymentMethodRef: { value: paymentMethodId } } : {}),
            ...(lines.length ? { Line: lines } : {}),
        },
    });

    const id = created?.Payment?.Id;
    if (!id) throw { status: 502, message: "QuickBooks did not return a payment id" };

    const supabase = getClient();
    const { error } = await supabase
        .from("payments")
        .update({
            qbo_payment_id: id,
            qbo_synced_at: new Date().toISOString(),
            qbo_error: null,
        })
        .eq("id", payment.id);

    if (error) throw new Error(error.message);

    return id;
}

/**
 * Application fees do not belong to a lot.
 *
 * Most applicants never move in, so giving each one a QuickBooks customer
 * would put a name in the books forever for someone who was never a resident,
 * and clutter every dropdown in the file. One customer holds them all; the
 * applicant's own name goes on the sales receipt, where it stays searchable.
 */
const APPLICANTS_CUSTOMER = "Applicants - Hometown Meadows";

/** A QuickBooks customer by display name, created if it is missing. */
async function ensureNamedCustomer(displayName, notes) {
    const found = await qboQuery(
        `select Id from Customer where DisplayName = '${qboEscape(displayName)}'`,
    );

    let id = found?.Customer?.[0]?.Id ?? null;

    if (!id) {
        const created = await qbo("/customer", {
            method: "POST",
            body: { DisplayName: displayName, Notes: notes },
        });

        id = created?.Customer?.Id ?? null;
    }

    if (!id) throw { status: 502, message: `Could not create the customer ${displayName}` };
    return id;
}

/**
 * Posts one application fee as a sales receipt.
 *
 * A sales receipt rather than an invoice and a payment, because nobody was
 * ever billed - the money arrives with the application. There is no
 * receivable to age, so inventing one would put a debt in the books that
 * never existed.
 */
export async function postApplicationFee(applicant) {
    if (applicant.qbo_txn_id) return applicant.qbo_txn_id;

    const amount = Number(applicant.fee_amount ?? 0);
    if (!(amount > 0)) return null;

    const customerId = await ensureNamedCustomer(
        APPLICANTS_CUSTOMER,
        "Created by Able OS. Application fees are not tied to a lot - most applicants never move in.",
    );

    const itemId = await ensureRentItem("Application Fee");

    // Card only when Stripe took it. A fee the office recorded by hand could
    // have arrived any number of ways, and we do not know which.
    let paymentMethodId = null;

    if (applicant.fee_stripe_payment_intent) {
        try {
            paymentMethodId = await ensurePaymentMethod("Credit Card", true);
        } catch (err) {
            console.error("qbo: could not resolve fee payment method", err?.message ?? err);
        }
    }

    const when = applicant.fee_paid_at ?? applicant.fee_paid_on ?? null;
    const who = String(applicant.name ?? "").trim() || "applicant";

    const created = await qbo("/salesreceipt", {
        method: "POST",
        body: {
            CustomerRef: { value: customerId },
            TxnDate: String(when ?? "").slice(0, 10) || undefined,
            PrivateNote: `Able OS applicant ${applicant.id} - ${who}${
                applicant.fee_receipt_no ? ` (${applicant.fee_receipt_no})` : ""
            }`,
            CustomerMemo: { value: `Application fee - ${who}` },
            ...(paymentMethodId ? { PaymentMethodRef: { value: paymentMethodId } } : {}),
            Line: [
                {
                    DetailType: "SalesItemLineDetail",
                    Amount: amount,
                    Description: `Application fee - ${who}`,
                    SalesItemLineDetail: {
                        ItemRef: { value: itemId },
                        Qty: 1,
                        UnitPrice: amount,
                    },
                },
            ],
        },
    });

    const id = created?.SalesReceipt?.Id;
    if (!id) throw { status: 502, message: "QuickBooks did not return a sales receipt id" };

    const supabase = getClient();
    const { error } = await supabase
        .from("applicants")
        .update({ qbo_txn_id: id })
        .eq("id", applicant.id);

    if (error) throw new Error(error.message);

    return id;
}
