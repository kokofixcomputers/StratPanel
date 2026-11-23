<?php

namespace Pterodactyl\Services\Store\Payments;

use Illuminate\Http\Request;
use Pterodactyl\Models\StoreOrder;

/** A service that takes payments. Nothing about what is bought is in here, only how to ask for money and how to be told it arrived. */
interface PaymentProvider
{
    /** The id the orders keep (stripe, paypal). */
    public function id(): string;

    public function name(): string;

    /** Whether the admin gave the keys it needs. */
    public function configured(): bool;

    /**
     * Asks the service for a page where the person pays, and keeps its reference on the order.
     *
     * @return string the address to send the person to
     *
     * @throws PaymentException
     */
    public function checkout(StoreOrder $order, string $returnUrl, string $cancelUrl): string;

    /**
     * Asks the service what became of an order (when the person came back, and from the webhook): paid, still pending, or canceled. Never
     * trusts what the browser said.
     *
     * @return string one of StoreOrder::PAID, PENDING, CANCELED, FAILED
     *
     * @throws PaymentException
     */
    public function status(StoreOrder $order, Request $returned): string;

    /**
     * Reads a notification from the service. Returns what it says about an order, or null when it is not about one (or is not genuine).
     *
     * @return array{order: string, status: string}|null  the uuid of the order and its new status
     */
    public function webhook(Request $request): ?array;

    /** Gives the money back. @throws PaymentException */
    public function refund(StoreOrder $order): void;
}
