<?php

namespace Pterodactyl\Services\Store\Payments;

use Pterodactyl\Exceptions\DisplayException;

/** The payment service said no, or could not be reached. The message is fit to show to the person. */
class PaymentException extends DisplayException
{
}
