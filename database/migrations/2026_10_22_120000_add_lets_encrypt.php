<?php

use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Migrations\Migration;

return new class () extends Migration {
    /**
     * Run the migrations.
     *
     * Free certificates from Let's Encrypt for the domains of servers: the answers to the challenges it asks, where a certificate came
     * from, and which domains are served over the web (http and https) by the edge.
     */
    public function up(): void
    {
        Schema::create('acme_challenges', function (Blueprint $table) {
            $table->string('token', 128)->primary();
            $table->string('content', 255);
            $table->timestamp('expires_at')->index();
        });

        Schema::table('certificates', function (Blueprint $table) {
            // manual (uploaded by an admin) or letsencrypt (made by the panel, and renewed by it).
            $table->string('source', 20)->default('manual')->after('name');
            $table->string('acme_domain', 255)->nullable()->after('source');
            $table->string('renew_error', 500)->nullable();
            $table->timestamp('renewed_at')->nullable();
        });

        Schema::table('server_domains', function (Blueprint $table) {
            // Served over the web by the edge: http (with a redirect to https once there is a certificate) and https, to the allocation.
            $table->boolean('web')->default(false);
            $table->unsignedInteger('certificate_id')->nullable();
            // none, pending, issued or failed (what asking Let's Encrypt came to).
            $table->string('certificate_status', 20)->default('none');
            $table->string('certificate_message', 500)->nullable();

            $table->foreign('certificate_id')->references('id')->on('certificates')->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('server_domains', function (Blueprint $table) {
            $table->dropForeign(['certificate_id']);
            $table->dropColumn(['web', 'certificate_id', 'certificate_status', 'certificate_message']);
        });
        Schema::table('certificates', function (Blueprint $table) {
            $table->dropColumn(['source', 'acme_domain', 'renew_error', 'renewed_at']);
        });
        Schema::dropIfExists('acme_challenges');
    }
};
