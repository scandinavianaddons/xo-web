import _ from 'intl'
import Icon from 'icon'
import React from 'react'
import { Container, Row, Col } from 'grid'
import { NavLink, NavTabs } from 'nav'
import { routes } from 'utils'

import Page from '../page'

// import Edit from './edit'
// import FileRestore from './file-restore'
// import New from './new'
import Overview from './overview'
// import Restore from './restore'

const HEADER = (
  <Container>
    <Row>
      <Col mediumSize={3}>
        <h2>
          <Icon icon='backup' /> {_('backupPage')}
        </h2>
      </Col>
      <Col mediumSize={9}>
        <NavTabs className='pull-right'>
          <NavLink to='/backup/overview'>
            <Icon icon='menu-backup-overview' /> {_('backupOverviewPage')}
          </NavLink>
          <NavLink to='/backup/new'>
            <Icon icon='menu-backup-new' /> {_('backupNewPage')}
          </NavLink>
          <NavLink to='/backup/restore'>
            <Icon icon='menu-backup-restore' /> {_('backupRestorePage')}
          </NavLink>
          <NavLink to='/backup/file-restore'>
            <Icon icon='menu-backup-file-restore' />{' '}
            {_('backupFileRestorePage')}
          </NavLink>
        </NavTabs>
      </Col>
    </Row>
  </Container>
)

const Backup = routes('overview', {
  // ':id/edit': Edit,
  // 'file-restore': FileRestore,
  // new: New,
  overview: Overview,
  // restore: Restore,
})(({ children }) => (
  <Page header={HEADER} title='backupPage' formatTitle>
    {children}
  </Page>
))

export default Backup
