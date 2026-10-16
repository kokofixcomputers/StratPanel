<?php

namespace Pterodactyl\Tests\Unit\Services\Acme;

use PHPUnit\Framework\TestCase;
use Pterodactyl\Services\Acme\DnsTxtChecker;

class DnsTxtCheckerTest extends TestCase
{
    /** The answer of a nameserver for a TXT question, built by hand (the answer name is a pointer to the question's, like real ones). */
    private function answer(string $name, array $texts): string
    {
        $message = pack('nnnnnn', 1, 0x8400, 1, count($texts), 0, 0);
        foreach (explode('.', $name) as $label) {
            $message .= chr(strlen($label)) . $label;
        }
        $message .= "\0" . pack('nn', 16, 1);
        foreach ($texts as $text) {
            $rdata = '';
            foreach (str_split($text, 255) as $piece) {
                $rdata .= chr(strlen($piece)) . $piece;
            }
            $message .= "\xC0\x0C" . pack('nnNn', 16, 1, 60, strlen($rdata)) . $rdata;
        }

        return $message;
    }

    public function testTheQuestionIsATxtQuestionForTheName(): void
    {
        $packet = DnsTxtChecker::buildQuery('_acme-challenge.a.example.com', 7);

        $this->assertSame(7, unpack('n', $packet)[1]);
        $this->assertSame("\x0f_acme-challenge\x01a\x07example\x03com\0", substr($packet, 12, -4));
        $this->assertSame([16, 1], array_values(unpack('n2', substr($packet, -4))));
        $this->assertSame(0, unpack('n', substr($packet, 2, 2))[1] & 0x0100, 'no recursion asked');
    }

    public function testTheTextsOfAnAnswerAreRead(): void
    {
        $answer = $this->answer('_acme-challenge.a.example.com', ['first', 'second-value']);

        $this->assertSame(['first', 'second-value'], DnsTxtChecker::parseTxt($answer));
    }

    public function testALongValueInSeveralPiecesIsJoined(): void
    {
        $long = str_repeat('x', 300);

        $this->assertSame([$long], DnsTxtChecker::parseTxt($this->answer('a.example.com', [$long])));
    }

    public function testAnAnswerWithNothingInItGivesNothing(): void
    {
        $this->assertSame([], DnsTxtChecker::parseTxt($this->answer('a.example.com', [])));
        $this->assertSame([], DnsTxtChecker::parseTxt('short'));
        $this->assertSame([], DnsTxtChecker::parseTxt(substr($this->answer('a.example.com', ['v']), 0, 30)), 'a cut off answer is not an error');
    }

    private function checker(array $servers, array $answers): DnsTxtChecker
    {
        return new class($servers, $answers) extends DnsTxtChecker {
            public function __construct(private array $servers, private array $answers)
            {
            }

            protected function nameserverAddresses(string $name): array
            {
                return $this->servers;
            }

            protected function query(string $ip, string $packet): ?string
            {
                return $this->answers[$ip] ?? null;
            }
        };
    }

    public function testTheRecordIsFoundWhenEveryNameserverHasIt(): void
    {
        $name = '_acme-challenge.a.example.com';
        $has = $this->answer($name, ['the-value']);

        $this->assertTrue($this->checker(['1.1.1.1', '2.2.2.2'], ['1.1.1.1' => $has, '2.2.2.2' => $has])->has($name, 'the-value'));
    }

    public function testANameserverThatIsBehindMeansNotYet(): void
    {
        $name = '_acme-challenge.a.example.com';
        $checker = $this->checker(['1.1.1.1', '2.2.2.2'], ['1.1.1.1' => $this->answer($name, ['the-value']), '2.2.2.2' => $this->answer($name, [])]);

        $this->assertFalse($checker->has($name, 'the-value'));
    }

    public function testAWrongValueIsNotTheRecord(): void
    {
        $name = '_acme-challenge.a.example.com';

        $this->assertFalse($this->checker(['1.1.1.1'], ['1.1.1.1' => $this->answer($name, ['something-else'])])->has($name, 'the-value'));
    }

    public function testAnUnreachableNameserverDoesNotDecide(): void
    {
        $name = '_acme-challenge.a.example.com';
        $has = $this->answer($name, ['the-value']);

        $this->assertTrue($this->checker(['9.9.9.9', '1.1.1.1'], ['1.1.1.1' => $has])->has($name, 'the-value'));
    }
}
