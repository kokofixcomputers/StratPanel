<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration {
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('server_domains', function (Blueprint $table) {
            // The TXT record the person has to add while a certificate is requested with the dns challenge.
            $table->string('dns_name', 255)->nullable();
            $table->string('dns_value', 255)->nullable();
        });

        Schema::table('certificates', function (Blueprint $table) {
            // http: made and renewed by the panel. dns: the person added a TXT record, so they have to do it again to renew.
            $table->string('acme_method', 10)->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('server_domains', function (Blueprint $table) {
            $table->dropColumn(['dns_name', 'dns_value']);
        });
        Schema::table('certificates', function (Blueprint $table) {
            $table->dropColumn('acme_method');
        });
    }
};
