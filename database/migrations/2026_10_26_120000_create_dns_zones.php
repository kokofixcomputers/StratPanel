<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Migrations\Migration;

return new class () extends Migration {
    /**
     * Domains of the admin that people can take a name under (play.example.com), with what the panel needs to add the
     * DNS record for it at the provider of that domain.
     */
    public function up(): void
    {
        Schema::create('dns_zones', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name', 60);
            $table->string('type', 30);
            $table->string('domain')->unique();
            $table->text('credentials');
            $table->boolean('enabled')->default(true);
            $table->unsignedInteger('ttl')->default(120);
            $table->timestamps();
        });

        Schema::table('server_domains', function (Blueprint $table) {
            // Set for a name under a domain of the admin: the panel made the record and removes it again.
            $table->unsignedInteger('dns_zone_id')->nullable();
            $table->string('dns_record_id', 64)->nullable();

            $table->foreign('dns_zone_id')->references('id')->on('dns_zones')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::table('server_domains', function (Blueprint $table) {
            $table->dropForeign(['dns_zone_id']);
            $table->dropColumn(['dns_zone_id', 'dns_record_id']);
        });
        Schema::dropIfExists('dns_zones');
    }
};
