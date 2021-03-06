import _ from 'intl'
import ActionButton from 'action-button'
import Collapse from 'collapse'
import Component from 'base-component'
import defined from 'xo-defined'
import differenceBy from 'lodash/differenceBy'
import filter from 'lodash/filter'
import forEach from 'lodash/forEach'
import get from 'lodash/get'
import Icon from 'icon'
import includes from 'lodash/includes'
import intersection from 'lodash/intersection'
import isEmpty from 'lodash/isEmpty'
import keys from 'lodash/keys'
import map from 'lodash/map'
import mapKeys from 'lodash/mapKeys'
import PropTypes from 'prop-types'
import React from 'react'
import remove from 'lodash/remove'
import renderXoItem from 'render-xo-item'
import ResourceSetQuotas from 'resource-set-quotas'
import Upgrade from 'xoa-upgrade'
import { Container, Row, Col } from 'grid'
import { createGetObjectsOfType, createSelector } from 'selectors'
import { injectIntl } from 'react-intl'
import { SizeInput } from 'form'

import {
  createResourceSet,
  deleteResourceSet,
  editResourceSet,
  recomputeResourceSetsLimits,
  subscribeIpPools,
  subscribeResourceSets,
} from 'xo'

import {
  addSubscriptions,
  connectStore,
  resolveIds,
  resolveResourceSets,
} from 'utils'

import {
  SelectIpPool,
  SelectNetwork,
  SelectPool,
  SelectSr,
  SelectSubject,
  SelectVmTemplate,
} from 'select-objects'

import { computeAvailableHosts, Subjects } from './helpers'

import Page from '../page'

// ===================================================================

const HEADER = (
  <Container>
    <Row>
      <Col mediumSize={12}>
        <h2>
          <Icon icon='menu-self-service' /> {_('selfServicePage')}
        </h2>
      </Col>
    </Row>
  </Container>
)

// ===================================================================

const Hosts = ({ eligibleHosts, excludedHosts }) => (
  <div>
    <Row>
      <Col mediumSize={6}>
        <h5>{_('availableHosts')}</h5>
        <p className='text-muted'>{_('availableHostsDescription')}</p>
      </Col>
      <Col mediumSize={6}>
        <h5>{_('excludedHosts')}</h5>
      </Col>
    </Row>
    <Row>
      <Col mediumSize={6}>
        <ul className='list-group'>
          {eligibleHosts.length ? (
            map(eligibleHosts, (host, key) => (
              <li key={key} className='list-group-item'>
                {renderXoItem(host)}
              </li>
            ))
          ) : (
            <li className='list-group-item'>{_('noHostsAvailable')}</li>
          )}
        </ul>
      </Col>
      <Col mediumSize={6}>
        <ul className='list-group'>
          {excludedHosts.length ? (
            map(excludedHosts, (host, key) => (
              <li key={key} className='list-group-item'>
                {renderXoItem(host)}
              </li>
            ))
          ) : (
            <li className='list-group-item'>
              <s>{_('noHostsAvailable')}</s>
            </li>
          )}
        </ul>
      </Col>
    </Row>
  </div>
)

Hosts.propTypes = {
  eligibleHosts: PropTypes.array.isRequired,
  excludedHosts: PropTypes.array.isRequired,
}

// ===================================================================

@connectStore(() => {
  const getHosts = createGetObjectsOfType('host').sort()
  const getHostsByPool = getHosts.groupBy('$pool')

  return {
    hosts: getHosts,
    hostsByPool: getHostsByPool,
  }
})
export class Edit extends Component {
  static propTypes = {
    onSave: PropTypes.func,
    resourceSet: PropTypes.object,
  }

  constructor (props) {
    super(props)

    this.state = {
      cpus: '',
      disk: null,
      eligibleHosts: [],
      excludedHosts: props.hosts,
      ipPools: [],
      memory: null,
      name: '',
      networks: [],
      pools: [],
      srs: [],
      subjects: [],
      templates: [],
    }
  }

  componentDidMount () {
    const { resourceSet } = this.props

    if (resourceSet) {
      // Objects
      const { objectsByType } = resourceSet
      const pools = {}
      forEach(objectsByType, objects => {
        forEach(objects, object => {
          pools[object.$pool] = true
        })
      })

      this._updateSelectedPools(
        keys(pools),
        objectsByType.SR,
        objectsByType.network
      )

      // Limits and others
      const { ipPools: rawIpPools, limits } = resourceSet

      const ipPools = []
      forEach(rawIpPools, ipPool => {
        ipPools.push({
          id: ipPool,
          quantity: get(limits, `[ipPool:${ipPool}].total`),
        })
      })

      this.setState({
        cpus: get(limits, 'cpus.total', ''),
        disk: get(limits, 'disk.total', null),
        ipPools,
        memory: get(limits, 'memory.total', null),
        name: resourceSet.name,
        subjects: resourceSet.subjects,
        templates: objectsByType['VM-template'] || [],
      })
    }
  }

  _save = async () => {
    const {
      cpus,
      disk,
      ipPools,
      memory,
      name,
      networks,
      srs,
      subjects,
      templates,
    } = this.state

    const set = this.props.resourceSet || (await createResourceSet(name))
    const objects = [...templates, ...srs, ...networks]

    const ipPoolsLimits = {}
    forEach(ipPools, ipPool => {
      if (ipPool.quantity) {
        ipPoolsLimits[`ipPool:${ipPool.id}`] = +ipPool.quantity
      }
    })

    await editResourceSet(set.id, {
      name,
      limits: {
        cpus: cpus === '' ? undefined : +cpus,
        memory: memory === null ? undefined : memory,
        disk: disk === null ? undefined : disk,
        ...ipPoolsLimits,
      },
      objects: resolveIds(objects),
      subjects: resolveIds(subjects),
      ipPools: resolveIds(ipPools),
    })

    this.props.onSave()
  }

  _reset = () => {
    this._updateSelectedPools([], [], [])

    this.setState({
      cpus: '',
      disk: null,
      ipPools: [],
      memory: null,
      newIpPool: undefined,
      newIpPoolQuantity: '',
      subjects: [],
    })
  }

  // -----------------------------------------------------------------------------

  _updateSelectedPools = (newPools, newSrs, newNetworks) => {
    const predicate = object => includes(resolveIds(newPools), object.$pool)

    this.setState(
      {
        nPools: newPools.length,
        pools: newPools,
        srPredicate: predicate,
        vmTemplatePredicate: predicate,
      },
      () => this._updateSelectedSrs(newSrs || this.state.srs, newNetworks)
    )
  }

  _updateSelectedSrs = (newSrs, newNetworks) => {
    const availableHosts = computeAvailableHosts(
      this.state.pools,
      newSrs,
      this.props.hostsByPool
    )
    const networkPredicate = network => {
      let kept = false
      forEach(
        availableHosts,
        host => !(kept = intersection(network.PIFs, host.PIFs).length > 0)
      )
      return kept
    }

    this.setState(
      {
        availableHosts,
        networkPredicate,
        nSrs: newSrs.length,
        srs: newSrs,
      },
      () => this._updateSelectedNetworks(newNetworks || this.state.networks)
    )
  }

  _updateSelectedNetworks = newNetworks => {
    const { availableHosts, srs } = this.state

    const eligibleHosts = filter(availableHosts, host => {
      let keptBySr = false
      let keptByNetwork = false

      forEach(
        srs,
        sr => !(keptBySr = intersection(sr.$PBDs, host.$PBDs).length > 0)
      )

      if (keptBySr) {
        forEach(
          newNetworks,
          network =>
            !(keptByNetwork = intersection(network.PIFs, host.PIFs).length > 0)
        )
      }

      return keptBySr && keptByNetwork
    })

    this.setState({
      eligibleHosts,
      excludedHosts: differenceBy(
        this.props.hosts,
        eligibleHosts,
        host => host.id
      ),
      networks: newNetworks,
    })
  }

  // -----------------------------------------------------------------------------

  _onChangeIpPool = newIpPool => {
    const { ipPools, newIpPoolQuantity } = this.state

    this.setState({
      ipPools: [...ipPools, { id: newIpPool.id, quantity: newIpPoolQuantity }],
      newIpPoolQuantity: '',
    })
  }

  _removeIpPool = index => {
    const ipPools = [...this.state.ipPools]
    remove(ipPools, (_, i) => index === i)
    this.setState({ ipPools })
  }

  _getIpPoolPredicate = createSelector(
    () => map(this.state.ipPools, 'id'),
    ipPoolsIds => ipPool => !includes(ipPoolsIds, ipPool.id)
  )

  // -----------------------------------------------------------------------------

  render () {
    const { state } = this
    const { resourceSet } = this.props

    return (
      <div>
        <li className='list-group-item'>
          <form id='resource-set-form' className='card-block'>
            <div className='form-group'>
              <Row>
                <Col mediumSize={4}>
                  <strong>{_('resourceSetName')}</strong>
                </Col>
                <Col mediumSize={4}>
                  <strong>{_('resourceSetUsers')}</strong>
                </Col>
                <Col mediumSize={4}>
                  <strong>{_('resourceSetPools')}</strong>
                </Col>
              </Row>
              <Row>
                <Col mediumSize={4}>
                  <input
                    className='form-control'
                    onChange={this.linkState('name')}
                    required
                    type='text'
                    value={state.name}
                  />
                </Col>
                <Col mediumSize={4}>
                  <SelectSubject
                    autoSelectSingleOption={false}
                    hasSelectAll
                    multi
                    onChange={this.linkState('subjects')}
                    required
                    value={state.subjects}
                  />
                </Col>
                <Col mediumSize={4}>
                  <SelectPool
                    autoSelectSingleOption={false}
                    hasSelectAll
                    multi
                    onChange={this._updateSelectedPools}
                    required
                    value={state.pools}
                  />
                </Col>
              </Row>
            </div>
            <div className='form-group'>
              <Row>
                <Col mediumSize={4}>
                  <strong>{_('resourceSetTemplates')}</strong>
                </Col>
                <Col mediumSize={4}>
                  <strong>{_('resourceSetSrs')}</strong>
                </Col>
                <Col mediumSize={4}>
                  <strong>{_('resourceSetNetworks')}</strong>
                </Col>
              </Row>
              <Row>
                <Col mediumSize={4}>
                  <SelectVmTemplate
                    autoSelectSingleOption={false}
                    disabled={!state.nPools}
                    hasSelectAll
                    multi
                    onChange={this.linkState('templates')}
                    predicate={state.vmTemplatePredicate}
                    required
                    value={state.templates}
                  />
                </Col>
                <Col mediumSize={4}>
                  <SelectSr
                    autoSelectSingleOption={false}
                    disabled={!state.nPools}
                    hasSelectAll
                    multi
                    onChange={this._updateSelectedSrs}
                    predicate={state.srPredicate}
                    required
                    value={state.srs}
                  />
                </Col>
                <Col mediumSize={4}>
                  <SelectNetwork
                    autoSelectSingleOption={false}
                    disabled={!state.nSrs}
                    hasSelectAll
                    multi
                    onChange={this._updateSelectedNetworks}
                    predicate={state.networkPredicate}
                    required
                    value={state.networks}
                  />
                </Col>
              </Row>
            </div>
            <div className='form-group'>
              <Row>
                <Col mediumSize={4}>
                  <strong>{_('maxCpus')}</strong>
                </Col>
                <Col mediumSize={4}>
                  <strong>{_('maxRam')}</strong>
                </Col>
                <Col mediumSize={4}>
                  <strong>{_('maxDiskSpace')}</strong>
                </Col>
              </Row>
              <Row>
                <Col mediumSize={4}>
                  <input
                    className='form-control'
                    min={0}
                    onChange={this.linkState('cpus')}
                    type='number'
                    value={state.cpus}
                  />
                </Col>
                <Col mediumSize={4}>
                  <SizeInput
                    onChange={this.linkState('memory')}
                    value={state.memory}
                  />
                </Col>
                <Col mediumSize={4}>
                  <SizeInput
                    onChange={this.linkState('disk')}
                    value={state.disk}
                  />
                </Col>
              </Row>
            </div>
            <div>
              <Row>
                <Col mediumSize={4}>
                  <Row>
                    <Col mediumSize={3}>
                      <strong>{_('quantity')}</strong>
                    </Col>
                    <Col mediumSize={7}>
                      <strong>{_('ipPool')}</strong>
                    </Col>
                  </Row>
                  {map(state.ipPools, (ipPool, index) => (
                    <Row className='mb-1' key={index}>
                      <Col mediumSize={3}>
                        <input
                          className='form-control'
                          type='number'
                          min={0}
                          onChange={this.linkState(`ipPools.${index}.quantity`)}
                          value={defined(ipPool.quantity, '')}
                          placeholder='∞'
                        />
                      </Col>
                      <Col mediumSize={7}>
                        <SelectIpPool
                          onChange={this.linkState(`ipPools.${index}.id`, 'id')}
                          value={ipPool.id}
                        />
                      </Col>
                      <Col mediumSize={2}>
                        <ActionButton
                          icon='delete'
                          handler={this._removeIpPool}
                          handlerParam={index}
                        />
                      </Col>
                    </Row>
                  ))}
                  <Row>
                    <Col mediumSize={3}>
                      <input
                        className='form-control'
                        type='number'
                        min={0}
                        onChange={this.linkState('newIpPoolQuantity')}
                        value={state.newIpPoolQuantity || ''}
                        placeholder='∞'
                      />
                    </Col>
                    <Col mediumSize={7}>
                      <SelectIpPool
                        onChange={this._onChangeIpPool}
                        predicate={this._getIpPoolPredicate()}
                        value={null}
                      />
                    </Col>
                  </Row>
                </Col>
              </Row>
            </div>
            <hr />
            <Hosts
              excludedHosts={state.excludedHosts}
              eligibleHosts={state.eligibleHosts}
            />
          </form>
        </li>
        <li className='list-group-item text-xs-center'>
          <div className='btn-toolbar'>
            <ActionButton
              btnStyle='primary'
              icon='save'
              handler={this._save}
              type='submit'
            >
              {_('saveResourceSet')}
            </ActionButton>
            <ActionButton icon='reset' handler={this._reset}>
              {_('resetResourceSet')}
            </ActionButton>
            {resourceSet && (
              <ActionButton
                btnStyle='danger'
                icon='delete'
                handler={deleteResourceSet}
                handlerParam={resourceSet}
              >
                {_('deleteResourceSet')}
              </ActionButton>
            )}
          </div>
        </li>
      </div>
    )
  }
}

@addSubscriptions({
  ipPools: subscribeIpPools,
})
@injectIntl
class ResourceSet extends Component {
  _renderDisplay = () => {
    const { resourceSet } = this.props
    const resolvedIpPools = mapKeys(this.props.ipPools, 'id')
    const { limits, ipPools, subjects, objectsByType } = resourceSet

    return [
      <li key='subjects' className='list-group-item'>
        <Subjects subjects={subjects} />
      </li>,
      ...map(objectsByType, (objectsSet, type) => (
        <li key={type} className='list-group-item'>
          {map(objectsSet, object =>
            renderXoItem(object, { className: 'mr-1' })
          )}
        </li>
      )),
      !isEmpty(ipPools) && (
        <li key='ipPools' className='list-group-item'>
          {map(ipPools, pool => {
            const resolvedIpPool = resolvedIpPools[pool]
            const ipPoolLimits = limits && get(limits, `[ipPool:${pool}]`)
            const available = ipPoolLimits && ipPoolLimits.available
            const total = ipPoolLimits && ipPoolLimits.total
            return (
              <span className='mr-1'>
                {renderXoItem({
                  name: resolvedIpPool && resolvedIpPool.name,
                  type: 'ipPool',
                })}
                {ipPoolLimits && (
                  <span>
                    {' '}
                    ({available}/{total})
                  </span>
                )}
              </span>
            )
          })}
        </li>
      ),
      <li key='graphs' className='list-group-item'>
        <ResourceSetQuotas limits={limits} />
      </li>,
      <li key='actions' className='list-group-item text-xs-center'>
        <div className='btn-toolbar'>
          <ActionButton
            btnStyle='primary'
            icon='edit'
            handler={this.toggleState('editionMode')}
          >
            {_('editResourceSet')}
          </ActionButton>
          <ActionButton
            btnStyle='danger'
            icon='delete'
            handler={deleteResourceSet}
            handlerParam={resourceSet}
          >
            {_('deleteResourceSet')}
          </ActionButton>
        </div>
      </li>,
    ]
  }

  _autoExpand = ref => {
    if (ref && ref.scrollIntoView) {
      ref.scrollIntoView()
    }
  }

  render () {
    const { resourceSet, autoExpand } = this.props

    return (
      <div className='mb-1' ref={this._autoExpand}>
        <Collapse buttonText={resourceSet.name} defaultOpen={autoExpand}>
          <ul className='list-group'>
            {this.state.editionMode ? (
              <Edit
                resourceSet={this.props.resourceSet}
                onSave={this.toggleState('editionMode')}
              />
            ) : (
              this._renderDisplay()
            )}
          </ul>
        </Collapse>
        {resourceSet.missingObjects.length > 0 && (
          <div className='alert alert-danger mb-0' role='alert'>
            <strong>{_('resourceSetMissingObjects')}</strong>{' '}
            {resourceSet.missingObjects.join(', ')}
          </div>
        )}
      </div>
    )
  }
}

// ===================================================================

export default class Self extends Component {
  constructor (props) {
    super(props)
    this.state = {}
  }

  componentWillMount () {
    this.componentWillUnmount = subscribeResourceSets(resourceSets => {
      this.setState({
        resourceSets: resolveResourceSets(resourceSets),
      })
    })
  }

  render () {
    const { resourceSets, showNewResourceSetForm } = this.state
    const { location } = this.props

    return (
      <Page formatTitle header={HEADER} title='selfServicePage'>
        {process.env.XOA_PLAN > 3 ? (
          <div>
            <div className='mb-1'>
              <ActionButton
                btnStyle='primary'
                className='mr-1'
                handler={this.toggleState('showNewResourceSetForm')}
                icon='add'
              >
                {_('resourceSetNew')}
              </ActionButton>
              <ActionButton
                handler={recomputeResourceSetsLimits}
                icon='refresh'
              >
                {_('recomputeResourceSets')}
              </ActionButton>
            </div>
            {showNewResourceSetForm && [
              <Edit
                key={0}
                onSave={this.toggleState('showNewResourceSetForm')}
              />,
              <hr key={1} />,
            ]}
            {resourceSets
              ? isEmpty(resourceSets)
                ? _('noResourceSets')
                : map(resourceSets, resourceSet => (
                  <ResourceSet
                    autoExpand={location.query.resourceSet === resourceSet.id}
                    key={resourceSet.id}
                    resourceSet={resourceSet}
                  />
                ))
              : _('loadingResourceSets')}
          </div>
        ) : (
          <Container>
            <Upgrade place='selfDashboard' available={4} />
          </Container>
        )}
      </Page>
    )
  }
}
