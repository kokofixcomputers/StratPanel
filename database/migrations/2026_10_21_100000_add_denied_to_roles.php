<?php

use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Migrations\Migration;

return new class () extends Migration {
    /**
     * Run the migrations.
     *
     * A role no longer only grants: `permissions` are the ones it grants, `denied` the ones it takes away. A denial wins over a grant of
     * another role. What a role says nothing about stays as it is (the default: nothing in the admin area, what the panel allows for
     * everything else).
     */
    public function up(): void
    {
        Schema::table('roles', function (Blueprint $table) {
            $table->json('denied')->nullable()->after('permissions');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('roles', function (Blueprint $table) {
            $table->dropColumn('denied');
        });
    }
};
