<?php

use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Migrations\Migration;

return new class () extends Migration {
    /**
     * Run the migrations.
     *
     * The https certificate of a node, pushed to its (forked) Wings by the panel.
     */
    public function up(): void
    {
        Schema::table('nodes', function (Blueprint $table) {
            // The certificate this node is given. Null: none is chosen (see certificate_auto).
            $table->unsignedInteger('certificate_id')->nullable();
            // Follow the certificate that covers the FQDN of the node: a renewed or replaced one is pushed by itself.
            $table->boolean('certificate_auto')->default(false);
            // What the panel last pushed (SHA-256 of the certificate), when, and what went wrong the last time.
            $table->char('certificate_fingerprint', 64)->nullable();
            $table->timestamp('certificate_pushed_at')->nullable();
            $table->string('certificate_error', 500)->nullable();

            $table->foreign('certificate_id')->references('id')->on('certificates')->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('nodes', function (Blueprint $table) {
            $table->dropForeign(['certificate_id']);
            $table->dropColumn(['certificate_id', 'certificate_auto', 'certificate_fingerprint', 'certificate_pushed_at', 'certificate_error']);
        });
    }
};
