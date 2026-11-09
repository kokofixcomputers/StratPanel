<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Linking a Minecraft account to a panel account (see MinecraftLinkService). */
return new class() extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // The Minecraft account that was proven to be this person's: its UUID (32 characters, no dashes) and name.
            $table->string('minecraft_uuid', 32)->nullable()->unique();
            $table->string('minecraft_username', 16)->nullable();
        });

        Schema::create('minecraft_link_codes', function (Blueprint $table) {
            $table->id();
            // What a player types into their account page. Only while it is valid, so it cannot clash with an old one.
            $table->string('code', 6)->unique();
            $table->string('minecraft_uuid', 32)->unique();
            $table->string('minecraft_username', 16);
            $table->timestamp('expires_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('minecraft_link_codes');
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['minecraft_uuid']);
            $table->dropColumn(['minecraft_uuid', 'minecraft_username']);
        });
    }
};
