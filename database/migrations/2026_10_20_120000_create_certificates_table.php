<?php

use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Migrations\Migration;

return new class () extends Migration {
    /**
     * Run the migrations.
     *
     * Certificates for serving the panel over https (Admin > Settings > Certificates).
     */
    public function up(): void
    {
        Schema::create('certificates', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name', 100);
            // The names the certificate is for, read from it (wildcards like *.example.com included).
            $table->json('domains');
            // The certificate and the ones that come after it (intermediates), PEM.
            $table->text('certificate');
            // Encrypted by the model, always without a passphrase.
            $table->text('private_key');
            $table->string('issuer', 255)->nullable();
            $table->timestamp('not_before')->nullable();
            $table->timestamp('not_after')->nullable();
            // SHA-256 of the certificate itself: the same certificate is not added twice.
            $table->char('fingerprint', 64)->unique();
            $table->boolean('enabled')->default(true);
            // The one that is used for a visitor who used no name (the IP address) or a name nothing covers.
            $table->boolean('is_default')->default(false);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('certificates');
    }
};
