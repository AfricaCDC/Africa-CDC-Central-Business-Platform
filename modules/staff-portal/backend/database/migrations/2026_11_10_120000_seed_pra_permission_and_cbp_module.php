<?php

use Illuminate\Database\Migrations\Migration;
use Modules\Settings\Services\CbpModulesAdminService;
use Modules\Settings\Services\PraModulePermissionSeeder;

return new class extends Migration
{
    public function up(): void
    {
        (new PraModulePermissionSeeder)->seed();
        app(CbpModulesAdminService::class)->ensureCoreModules();
    }

    public function down(): void
    {
        // Keep seeded permissions and CBP module rows.
    }
};
