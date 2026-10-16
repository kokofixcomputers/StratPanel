<?php

use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Migrations\Migration;

return new class () extends Migration {
    /**
     * Run the migrations.
     *
     * Roles are named sets of administration permissions that can be given to users. Root admins (users.root_admin) are not
     * affected: they can do everything, whatever roles they have.
     */
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name', 60)->unique();
            $table->string('description', 255)->nullable();
            // A colour for the label of the role, a hex value like #3b82f6.
            $table->string('color', 7)->default('#3b82f6');
            // The keys of the permissions, see Pterodactyl\Services\Roles\PermissionRegistry.
            $table->json('permissions');
            $table->timestamps();
        });

        Schema::create('role_user', function (Blueprint $table) {
            $table->unsignedInteger('role_id');
            $table->unsignedInteger('user_id');
            $table->timestamp('created_at')->nullable();

            $table->primary(['role_id', 'user_id']);
            $table->foreign('role_id')->references('id')->on('roles')->onDelete('cascade');
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('role_user');
        Schema::dropIfExists('roles');
    }
};
