<?php

use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Migrations\Migration;

return new class () extends Migration {
    /**
     * Run the migrations.
     *
     * Sign in with other services: the services an admin set up, and which account at them belongs to which user.
     */
    public function up(): void
    {
        Schema::create('auth_providers', function (Blueprint $table) {
            $table->increments('id');
            // The name in the addresses (/auth/oauth/<key>/...), lowercase letters, digits and dashes.
            $table->string('key', 40)->unique();
            // github, google, discord, microsoft, gitlab or oauth2 (any other service that speaks OAuth 2).
            $table->string('type', 20);
            $table->string('name', 60);
            $table->string('client_id', 255);
            // Encrypted by the model.
            $table->text('client_secret');
            $table->string('scopes', 255)->nullable();
            // Only used by type oauth2: the addresses of the service and where in its answers the user's details are.
            $table->json('endpoints')->nullable();
            $table->boolean('enabled')->default(true);
            // Whether somebody without an account can create one with this service (when self sign up is on).
            $table->boolean('allow_signup')->default(true);
            $table->timestamps();
        });

        Schema::create('user_identities', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('user_id');
            $table->unsignedInteger('auth_provider_id');
            // Who the user is at the service. Never an email address: those change hands.
            $table->string('provider_user_id', 191);
            $table->string('email', 191)->nullable();
            $table->string('display_name', 191)->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();

            $table->unique(['auth_provider_id', 'provider_user_id']);
            $table->unique(['user_id', 'auth_provider_id']);
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
            $table->foreign('auth_provider_id')->references('id')->on('auth_providers')->onDelete('cascade');
        });

        // Passkeys (WebAuthn): the public key of a device or password manager, never anything secret.
        Schema::create('user_passkeys', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('user_id');
            $table->string('name', 100);
            // The id the browser gives back when signing in, base64url.
            $table->string('credential_id', 512)->unique();
            // The credential record of the WebAuthn library as JSON: public key, counter, transports and so on.
            $table->text('record');
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();

            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
        });

        // People who signed up with a service never chose a password. They can set one (by resetting it) but until they do, they
        // must not be left without a way in when they unlink the service, and changing the password does not ask for the old one.
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('password_set')->default(true)->after('password');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('password_set');
        });
        Schema::dropIfExists('user_passkeys');
        Schema::dropIfExists('user_identities');
        Schema::dropIfExists('auth_providers');
    }
};
