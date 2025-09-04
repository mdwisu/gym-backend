const express = require('express');
const { prisma } = require('../prisma');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// Get all packages
router.get('/', async (req, res) => {
  try {
    const packages = await prisma.membershipPackage.findMany({
      where: { isActive: true },
      orderBy: { durationMonths: 'asc' }
    });
    res.json(packages);
  } catch (error) {
    console.error('Get packages error:', error);
    res.status(500).json({ error: 'Failed to fetch packages' });
  }
});

// Create package
router.post('/', async (req, res) => {
  try {
    const { name, durationMonths, price, description } = req.body;

    if (!name || !durationMonths || !price) {
      return res.status(400).json({ 
        error: 'Required fields: name, durationMonths, price' 
      });
    }

    const membershipPackage = await prisma.membershipPackage.create({
      data: {
        name: name.trim(),
        durationMonths: parseInt(durationMonths),
        price: parseFloat(price),
        description: description?.trim() || null
      }
    });

    res.status(201).json({
      message: 'Package created successfully',
      package: membershipPackage
    });
  } catch (error) {
    console.error('Create package error:', error);
    res.status(500).json({ error: 'Failed to create package' });
  }
});

// Update package
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, durationMonths, price, description, isActive } = req.body;

    // Get package details first to check if it's Day Pass
    const existingPackage = await prisma.membershipPackage.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existingPackage) {
      return res.status(404).json({ error: 'Package not found' });
    }

    // Check if this is a Day Pass package
    const isDayPass = existingPackage.name === 'Day Pass' || existingPackage.durationMonths === 0;

    if (isDayPass) {
      // For Day Pass, only allow price and description updates
      if (!price) {
        return res.status(400).json({ 
          error: 'Required field: price' 
        });
      }

      // Prevent name and duration changes for Day Pass
      if (name && name.trim() !== existingPackage.name) {
        return res.status(403).json({
          error: 'Day Pass name cannot be changed',
          message: 'Day Pass name is protected and cannot be modified. You can only update price and description.'
        });
      }

      if (durationMonths !== undefined && parseInt(durationMonths) !== existingPackage.durationMonths) {
        return res.status(403).json({
          error: 'Day Pass duration cannot be changed',
          message: 'Day Pass duration is protected and cannot be modified. You can only update price and description.'
        });
      }

      const membershipPackage = await prisma.membershipPackage.update({
        where: { id: parseInt(id) },
        data: {
          price: parseFloat(price),
          description: description?.trim() || existingPackage.description,
          isActive: isActive !== undefined ? isActive : existingPackage.isActive
        }
      });

      res.json({
        message: 'Day Pass package updated successfully',
        package: membershipPackage
      });
    } else {
      // For regular packages, require all fields
      if (!name || !durationMonths || !price) {
        return res.status(400).json({ 
          error: 'Required fields: name, durationMonths, price' 
        });
      }

      const membershipPackage = await prisma.membershipPackage.update({
        where: { id: parseInt(id) },
        data: {
          name: name.trim(),
          durationMonths: parseInt(durationMonths),
          price: parseFloat(price),
          description: description?.trim() || null,
          isActive: isActive !== undefined ? isActive : true
        }
      });

      res.json({
        message: 'Package updated successfully',
        package: membershipPackage
      });
    }
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Package not found' });
    }
    console.error('Update package error:', error);
    res.status(500).json({ error: 'Failed to update package' });
  }
});

// Delete package
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get package details first
    const packageToDelete = await prisma.membershipPackage.findUnique({
      where: { id: parseInt(id) }
    });

    if (!packageToDelete) {
      return res.status(404).json({ error: 'Package not found' });
    }

    // Protect Day Pass package from deletion
    if (packageToDelete.name === 'Day Pass' || packageToDelete.durationMonths === 0) {
      return res.status(403).json({ 
        error: 'Day Pass package cannot be deleted',
        message: 'Day Pass is a critical package required for single-day visits and cannot be deleted. You can only modify its price or description.',
        action: 'edit_package_instead'
      });
    }

    // Check if package is used in any transactions
    const transactionCount = await prisma.transaction.count({
      where: { packageId: parseInt(id) }
    });

    if (transactionCount > 0) {
      // Don't delete, just deactivate
      await prisma.membershipPackage.update({
        where: { id: parseInt(id) },
        data: { isActive: false }
      });
      
      return res.json({ 
        message: 'Package deactivated (cannot delete as it has transaction history)' 
      });
    }

    // Safe to delete if no transactions
    await prisma.membershipPackage.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Package deleted successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Package not found' });
    }
    console.error('Delete package error:', error);
    res.status(500).json({ error: 'Failed to delete package' });
  }
});

module.exports = router;